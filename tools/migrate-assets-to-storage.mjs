import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = "http://26.102.209.103:8000";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc5NTYxMzcwLCJleHAiOjE5MzcyNDEzNzB9.CZrCunULjqNO0CUOnS-QLybdaSul_TZwmoK2t0-Yd5E";
const CAMPAIGN_ID = "Alpha";
const TABLE_NAME = "campaign_snapshots";
const BUCKET = "campaign-assets";

const USER_DATA_DIR = path.join(
  process.env.APPDATA || "",
  "galactic-rpg-interface"
);

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".svg"
]);

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml"
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false
  }
});

function normalizeSupabaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function isImagePath(value) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function looksLikeLocalPath(value) {
  const text = String(value || "");

  return (
    text.startsWith("file:///") ||
    text.startsWith("C:\\") ||
    text.startsWith("C:/") ||
    text.includes("AppData/Roaming/galactic-rpg-interface") ||
    text.includes("AppData\\Roaming\\galactic-rpg-interface")
  );
}

function localPathFromValue(value) {
  const text = String(value || "");

  if (text.startsWith("file:///")) {
    return fileURLToPath(text);
  }

  if (text.startsWith("C:/")) {
    return text.replaceAll("/", "\\");
  }

  return text;
}

function makeStoragePath(localFilePath) {
  const parsed = path.parse(localFilePath);
  const ext = parsed.ext.toLowerCase();
  const safeName = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/giu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "asset";

  const hash = crypto
    .createHash("sha1")
    .update(localFilePath)
    .digest("hex")
    .slice(0, 12);

  return `${CAMPAIGN_ID.toLowerCase()}/migrated/${hash}_${safeName}${ext}`;
}

function publicUrlFor(storagePath) {
  const encodedPath = storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${normalizeSupabaseUrl(SUPABASE_URL)}/storage/v1/object/public/${BUCKET}/${encodedPath}`;
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

const uploadCache = new Map();

async function uploadLocalImage(localFilePath) {
  const normalizedPath = path.normalize(localFilePath);

  if (uploadCache.has(normalizedPath)) {
    return uploadCache.get(normalizedPath);
  }

  if (!(await fileExists(normalizedPath))) {
    console.warn("Файл не найден:", normalizedPath);
    return null;
  }

  const ext = path.extname(normalizedPath).toLowerCase();

  if (!IMAGE_EXTENSIONS.has(ext)) {
    return null;
  }

  const storagePath = makeStoragePath(normalizedPath);
  const bytes = await fs.readFile(normalizedPath);
  const contentType = MIME_BY_EXT[ext] || "application/octet-stream";

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      upsert: true,
      cacheControl: "31536000"
    });

  if (error) {
    throw new Error(
      `Не удалось загрузить ${normalizedPath} в ${storagePath}: ${error.message}`
    );
  }

  const publicUrl = publicUrlFor(storagePath);
  uploadCache.set(normalizedPath, publicUrl);

  console.log("Загружено:", normalizedPath);
  console.log("URL:", publicUrl);

  return publicUrl;
}

async function migrateJson(value) {
  if (Array.isArray(value)) {
    const result = [];

    for (const item of value) {
      result.push(await migrateJson(item));
    }

    return result;
  }

  if (value && typeof value === "object") {
    const result = {};

    for (const [key, childValue] of Object.entries(value)) {
      result[key] = await migrateJson(childValue);
    }

    return result;
  }

  if (typeof value === "string") {
    if (looksLikeLocalPath(value) && isImagePath(value)) {
      const localFilePath = localPathFromValue(value);
      const publicUrl = await uploadLocalImage(localFilePath);

      if (publicUrl) {
        return publicUrl;
      }
    }
  }

  return value;
}

async function uploadAllImagesFromAssetsFolder() {
  const assetsDir = path.join(USER_DATA_DIR, "world-data", "assets");

  async function walk(dir) {
    let entries = [];

    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && isImagePath(fullPath)) {
        await uploadLocalImage(fullPath);
      }
    }
  }

  await walk(assetsDir);
}

async function main() {
  console.log("Кампания:", CAMPAIGN_ID);
  console.log("Supabase:", SUPABASE_URL);
  console.log("UserData:", USER_DATA_DIR);

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("campaign_id, revision, state_json")
    .eq("campaign_id", CAMPAIGN_ID)
    .single();

  if (error) {
    throw new Error(`Не удалось прочитать snapshot: ${error.message}`);
  }

  console.log("Текущая ревизия:", data.revision);

  const migratedState = await migrateJson(data.state_json);

  await uploadAllImagesFromAssetsFolder();

  const { error: updateError } = await supabase
    .from(TABLE_NAME)
    .update({
      state_json: migratedState,
      updated_by: "asset-migration-script",
      client_updated_at: new Date().toISOString()
    })
    .eq("campaign_id", CAMPAIGN_ID);

  if (updateError) {
    throw new Error(`Не удалось обновить snapshot: ${updateError.message}`);
  }

  console.log("Готово.");
  console.log("Загружено или проверено файлов:", uploadCache.size);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});