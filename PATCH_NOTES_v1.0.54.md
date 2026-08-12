# GRPGI 1.0.54 — Character Registration UX

- Registration now opens as a dedicated modal window instead of expanding inside the login card.
- Registration origin choices are long-form visual cards with image, full description and characteristic modifiers.
- “Социальное происхождение” is renamed to “Профессия” in World Config, profile and registration UI.
- Geographic origin remains a separate concept and may represent a city, planet, region, station, colony or other place.
- World Config geographic origins now include a `locationType` selector. Existing origins migrate as `other`.
- Registration descriptions accept longer character biographies.
- Existing internal keys (`socialOrigins`, `socialOriginId`) remain for backward compatibility with saved worlds.
- No npm install/ci was run.
