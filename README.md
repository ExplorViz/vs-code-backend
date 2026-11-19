# vs-code-backend

## Lokaler Start mit Docker Compose

Docker Compose startet das Backend zusammen mit MongoDB:

```sh
docker compose up --build
```

Das Backend ist auf Port `3000` erreichbar. MongoDB verwendet standardmäßig
Port `27018`, passend zur lokalen Standard-URL der App. Der Port wird für den
MongoDB-Container und dessen veröffentlichte Verbindung gemeinsam gesetzt.
Den MongoDB-Port kannst du in der bereits vorhandenen `.env`-Datei ändern:

```dotenv
MONGO_PORT=27018
```

Trage dort beispielsweise `MONGO_PORT=27019` ein, um stattdessen Port `27019`
zu verwenden.
Die App verbindet sich im Compose-Netzwerk mit `mongo` und übernimmt diesen
Port automatisch. Lokal außerhalb von Compose kann die MongoDB-URL über
`MONGO_URL` gesetzt werden; ohne diese Variable wird
`mongodb://localhost:27018` verwendet. Die Datenbank heißt `vscode-backend`,
die Collection `snapshots`. MongoDB-Daten bleiben in einem Compose-Volume
erhalten.

Mit `docker compose down` werden die Container beendet. Das persistente Volume
bleibt dabei erhalten; `docker compose down -v` entfernt es ebenfalls.
