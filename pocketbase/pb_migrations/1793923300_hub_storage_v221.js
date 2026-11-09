migrate((app) => {
  app.db().newQuery("CREATE TABLE grpgi_hub_storage_v221 (scope TEXT PRIMARY KEY NOT NULL, contents TEXT NOT NULL)").execute();
  app.db().newQuery("CREATE TABLE grpgi_hub_receipts_v221 (actor TEXT NOT NULL, operation TEXT NOT NULL, request TEXT NOT NULL, PRIMARY KEY(actor, operation))").execute();
});
