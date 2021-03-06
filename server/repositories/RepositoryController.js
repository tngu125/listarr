const SonarrRepository = require("./SonarrRepository");
const TraktRepository = require("./TraktRepository");
const FSRepository = require("./FSRepository");

class RepositoryController {
  /*sonarr = new SonarrRepository("", "");
  trakt = new TraktRepository("");
  file = new FSRepository();
  interval = 60;*/

  constructor(path) {
    this.fs = new FSRepository();
    this.folders = [];
    this.profiles = [];
    if (this.fs.checkFileExists(path)) {
      const data = this.fs.readDataFromFile(path);
      this.sonarr = new SonarrRepository(data.sonarrURL, data.sonarrApiKey);
      this.trakt = new TraktRepository(data.traktApiKey);
      this.interval = data.interval;
      console.log("Loaded Data");
    } else {
      this.sonarr = new SonarrRepository("", "");
      this.trakt = new TraktRepository("");
      this.interval = 60;
      console.log("Default Data Loaded");
    }
  }

  async testSettings(sonarrURL, sonarrApiKey, traktApiKey) {
    let sonarrTest = await this.sonarr.testConnection(sonarrURL, sonarrApiKey);
    let traktTest = await this.trakt.testConnection(traktApiKey);

    if (sonarrTest === "Success" && traktTest === true) {
      return "Success";
    } else if (sonarrTest !== "Success" && traktTest === true) {
      return sonarrTest;
    } else if (sonarrTest === "Success" && traktTest !== true) {
      return "Trakt API Key Invalid";
    } else {
      return "Sonarr and Trakt Settings Have Errors";
    }
  }

  async setSettings(sonarrURL, sonarrApiKey, traktApiKey, interval) {
    try {
      this.sonarr = new SonarrRepository(sonarrURL, sonarrApiKey);
      this.trakt = new TraktRepository(traktApiKey);
      if (interval !== "" && interval !== " ") {
        this.interval = interval;
      }

      const data = {
        sonarrURL: sonarrURL,
        sonarrApiKey: sonarrApiKey,
        traktApiKey: traktApiKey,
        interval: this.interval,
      };

      try {
        this.fs.writeDataToFile("./config/settings.json", data);
      } catch (err) {
        console.log(err);
      }
      return "Success";
    } catch (err) {
      return "Error Saving Settings";
    }
  }

  saveLists(lists) {
    try {
      this.fs.writeDataToFile("./config/lists.json", lists);
    } catch (err) {
      console.log(err);
    }
  }

  async getConfig() {
    if (
      this.folders.length === 0 ||
      this.profiles.length === 0 ||
      this.folders === "Error Getting Root Folders" ||
      this.profiles === "Error Getting Profiles"
    ) {
      this.folders = await this.sonarr.getRootFolder();
      this.profiles = await this.sonarr.getQualityProfiles();
    }

    let url = this.sonarr.baseUrl;
    url = url.substring(0, url.length - 4);

    let settings = {
      sonarrUrl: url,
      sonarrApiKey: this.sonarr.apiKey,
      traktApiKey: this.trakt.apiKey,
      interval: this.interval,
    };

    let data = {
      folders: this.folders,
      profiles: this.profiles,
    };

    if (settings.sonarrApiKey !== "" && settings.sonarrApiKey !== " ") {
      data.settings = settings;
    }

    return data;
  }

  async addShows(lists) {
    let shows = new Set();
    let count = 0;
    let existing = await this.sonarr.getExistingSeries();

    for (const list of lists) {
      let response;

      if (list.type === "Custom") {
        //custom list
        response = await this.trakt.getUserCustomList(
          list.username,
          list.listname
        );
      } else if (
        list.type === "Watchlist" ||
        list.type === "Collection" ||
        list.type === "UserWatched"
      ) {
        //user trakt list
        let type = list.type;
        if (list.type === "UserWatched") {
          type = "Watched";
        }
        response = await this.trakt.getUserList(
          list.username,
          type.toLowerCase()
        );
      } else if (list.type === "Recommended" || list.type === "Watched") {
        response = await this.trakt.getTraktTimedList(
          list.type.toLowerCase(),
          list.limit,
          list.timePeriod
        );
      } else {
        //popular, trending or anticipated
        response = await this.trakt.getTraktCuratedList(
          list.type.toLowerCase(),
          list.limit
        );
      }

      if (Array.isArray(response)) {
        // eslint-disable-next-line no-loop-func
        response.forEach((show) => {
          if (!existing.includes(show.tvdb)) {
            shows.add({
              title: show.title,
              tvdb: show.tvdb,
              quality: list.quality,
              folder: list.folder,
            });
          } else {
            count++;
          }
        });
      }
    }
    if (count > 0) {
      console.log(`${count} Shows Already Exist`);
    }

    let list = Array.from(shows);

    if (list.length !== 0) {
      console.log(`Attempting To Add ${list.length} Shows`);
      shows = await this.sonarr.listLookup(list);
      this.sonarr.addList(shows);
    }

    console.log("--- Sent Lists To Sonarr ---");
  }
}

module.exports = RepositoryController;
