const fs = require('fs');
const moment = require('moment');
const request = require('request');
const stringify = require('csv-stringify/lib/sync');

const startDate = moment(fs.readFileSync('startdate.txt', 'utf8')).format('YYYYMMDD');
const endDate = moment(fs.readFileSync('enddate.txt', 'utf8')).isValid()
    ? moment(fs.readFileSync('enddate.txt', 'utf8')).format('YYYYMMDD')
    : moment(startDate).subtract(1, 'days').format('YYYYMMDD');

try {
    loadFillAndSave(startDate, endDate);
} catch (err) {
    console.error(err);
    console.log('EXITING');
}


// fillTable(game);

// console.log(getGameImageToWrite(game));


/******************************************************************************
 * FUNCTIONS                                                                  *
 ******************************************************************************/


function loadFillAndSave(date, endDate) {
    if (endDate && moment(endDate).isAfter(date)) {
        throw `CHECK DATES! ${date} SHOULDN'T BE GREATER THAN ${endDate}`;
    }
    console.info('GETTING DATA FOR DATE = ', date);
    loadLeagueForDate(date)
        .then(data => {
            if (!(data && data.scores && data.scores.length)) {
                console.info('EMPTY DATA RECEIVED');
                return;
            }
            const goodLeagues = data.scores.filter(x => checkLeagueData(x));
            if (!goodLeagues.length) {
                console.info('NOTHING INTERESTING TODAY');
                return;
            }
            let leagueFns = goodLeagues.map(league => processLeague(date, league.leagues[0], league.events));
            return Promise.all(leagueFns);
        })
        .then(() => {
            processNextDate(date, endDate);
        })
        .catch(e => {
            console.error('ERROR', e);
            saveErrorToFile(e, date);
            console.info('EXITING');
        });
}

function processNextDate(date, endDate) {
    if (moment(endDate).isBefore(date)) {
        console.info('CALLING NEXT DAY');
        loadFillAndSave(moment(date).subtract(1, 'days').format('YYYYMMDD'), endDate);
    } else {
        console.info('JOB DONE');
    }
}

function loadUrl(url) {
    const header = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:62.0) Gecko/20100101 Firefox/62.0',
        'Accept': '*/*',
        'Connection': 'keep-alive'
    };

    return new Promise((rs, rj) => {
        console.info('requesting', url);
        request({url, header}, function(error, response, body) {
            if (error) {
                return rj(error);
            }
            try {
                rs(JSON.parse(body));
            } catch (e) {
                rj(e);
            }

        });
    });
}

function loadLeagueForDate(date) {
    return loadUrl(`http://site.web.api.espn.com/apis/site/v2/sports/rugby/scorepanel?lang=en&region=gb&dates=${date}`);
}

function loadEvent(league, game) {
    return loadUrl(`http://site.web.api.espn.com/apis/site/v2/sports/rugby/${league}/summary?event=${game}`);
}


const leagues = [
    //Northern
	'267979',
    '270557',
    '270559',
	'271937',
	'272073',
	//International
	'164205',
	'180659',
	'244293',
	'289234',
	//Super
	'242041'
	
];

function checkLeagueData(leagueData) {
    return leagueData && leagueData.leagues && leagueData.leagues.length && leagueData.leagues[0].slug && (leagues.indexOf(leagueData.leagues[0].slug) >= 0)
}


function processLeague(date, leagueInfo, events) {
    const eventFns = events.map(eventInfo => processEvent(date, leagueInfo, eventInfo));
    return Promise.all(eventFns);
}

function processEvent(date, leagueInfo, eventInfo) {
    return new Promise((rs, rj) => {
        console.log('PROCESSING', date, leagueInfo.name, eventInfo.name);
        loadEvent(leagueInfo.slug, eventInfo.id)
            .then(eventData => {
                const homeTeamInfo = eventData && eventData.rosters && eventData.rosters.filter(x => x.homeAway === 'home').shift() || null;
                const awayTeamInfo = eventData && eventData.rosters && eventData.rosters.filter(x => x.homeAway === 'away').shift() || null;
                const gameData = createGameData(date, leagueInfo, eventInfo, homeTeamInfo, awayTeamInfo);
                fillTable(gameData);
                storeToFile(getGameImageToWrite(gameData));
                rs(true);
            })
            .catch(rj);
    })
}


function createGameData(date, leagueInfo, eventInfo, homeTeamInfo, awayTeamInfo) {
    const gameData = new GameData();
    gameData.game = eventInfo.id;
    gameData.league = leagueInfo.slug;
    gameData.leagueName = leagueInfo.abbreviation;
    gameData.year = moment(date).format("YYYY");
    gameData.month = moment(date).format("MM");
    gameData.day = moment(date).format("DD");

    fillTeamData(gameData.homeTeam, eventInfo.competitions[0].competitors[0], homeTeamInfo);
    fillTeamData(gameData.awayTeam, eventInfo.competitions[0].competitors[1], awayTeamInfo);
    return gameData;
}

function fillTeamData(teamData, teamInfo, teamRosterInfo) {

    const stats = teamInfo.statistics;
    teamData.name = teamInfo.team.name;
    teamData.score = teamInfo.score;
    teamData.Tries = stats[152].displayValue;
    teamData.ConversionGoals = stats[19].displayValue;
    teamData.PenaltyGoals = stats[107].displayValue;
    teamData.YellowCards = stats[168].displayValue;
    teamData.RedCards = stats[112].displayValue;
    teamData.MetresRun = stats[75].displayValue;
    teamData.KicksFromHand = stats[41].displayValue;
    teamData.Passes = stats[81].displayValue;
    teamData.Runs = stats[128].displayValue;
    teamData.Possession1H = stats[83].displayValue;
    teamData.Possession2H = stats[84].displayValue;
    teamData.Territory1H = stats[85].displayValue;
    teamData.Territory2H = stats[86].displayValue;
    teamData.CleanBreaks = stats[13].displayValue;
    teamData.DefendersBeaten = stats[20].displayValue;
    teamData.Offload = stats[80].displayValue;
    teamData.RucksWon = stats[127].displayValue;
    teamData.RucksLost = stats[125].displayValue - stats[127].displayValue;
    teamData.MaulsWon = stats[70].displayValue;
    teamData.MaulsLost = stats[69].displayValue - stats[70].displayValue;
    teamData.TurnoversConceded = stats[166].displayValue;
    teamData.ScrumsWon = stats[137].displayValue;
    teamData.ScrumsLost = stats[136].displayValue - stats[137].displayValue;
    teamData.LineoutsWon = stats[51].displayValue;
    teamData.LineoutsLost = stats[151].displayValue - stats[51].displayValue;
    teamData.TotalFreeKicksConceded = stats[148].displayValue;
    teamData.PenaltiesConceeded = stats[87].displayValue;

    fillRosterData(teamData, teamRosterInfo);
}

function fillRosterData(teamData, teamInfo) {
    teamData.players = teamInfo && teamInfo.roster && teamInfo.roster.map(info => {
        const player = new PlayerData();
        player.playerName = info.athlete.displayName;
        if (info.stats){
            player.MR = info.stats[8].value;
            player.CB = info.stats[0].value;
            player.DB = info.stats[2].value;
            player.T = info.stats[18].value;
            player.MT = info.stats[9].value;
            player.YC = info.stats[25].value;
            player.RC = info.stats[15].value;
            player.DGC = info.stats[3].value;
        }
        return player;
    }) || [];
}

function storeToFile(gameData) {
    console.log('STORE TO FILE', gameData.leagueName, gameData.name_h, gameData.name_a, gameData.year, gameData.month, gameData.day);
    const fileGames = fs.createWriteStream("games.csv", {flags: 'a'});
    fileGames.write(stringify([gameData]), () => fileGames.end());
}


const ignoreGameKeys = ['homeTeam', 'awayTeam'];

function GameData() {
    this.game = '';
    this.league = '';
    this.leagueName = '';
    this.name_h = '';
    this.name_a = '';
    this.year = '';
    this.month = '';
    this.day = '';

    this.score_h = '';
    this.score_a = '';
    this.Tries_h = '';
    this.Tries_a = '';
    this.ConversionGoals_h = '';
    this.ConversionGoals_a = '';
    this.PenaltyGoals_h = '';
    this.PenaltyGoals_a = '';
    this.DropGoalsConverted_h = 0;
    this.DropGoalsConverted_a = 0;
    this.BookingPoints_h = '';
    this.BookingPoints_a = '';
    this.YellowCards_h = '';
    this.YellowCards_a = '';
    this.RedCards_h = '';
    this.RedCards_a = '';

    this.homeTeam = new TeamData();
    this.awayTeam = new TeamData();
}

function TeamData() {
    this.name = '';
    this.score = '';
    this.Tries = '';
    this.ConversionGoals = '';
    this.PenaltyGoals = '';
    this.DropGoalsConverted = 0;   //This is the sum of the DGC from the player stats
    this.BookingPoints = 0;         //From  match stats: 10 Points for Yellow Card; 25 Points for the Red Card
    this.YellowCards = '';
    this.RedCards = '';
    this.MetresRun = '';
    this.KicksFromHand = '';
    this.Passes = '';
    this.Runs = '';
    this.Possession1H = ''; 
    this.Possession2H = '';
    this.Territory1H = '';
    this.Territory2H = '';
    this.CleanBreaks = '';
    this.DefendersBeaten = '';
    this.Offload = '';
    this.RucksWon = '';
    this.RucksLost = '';
    this.MaulsWon = '';
    this.MaulsLost = '';
    this.TurnoversConceded = '';
    this.ScrumsWon = '';
    this.ScrumsLost = '';
    this.LineoutsWon = '';
    this.LineoutsLost = '';
    this.TotalFreeKicksConceded = '';
    this.PenaltiesConceeded = '';

    this.players = [];
}


function PlayerData() {
    this.playerName = '';
    this.MR = 0;
    this.CB = 0;
    this.DB = 0;
    this.T = 0;
    this.MT = 0;
    this.YC = 0;
    this.RC = 0;
    this.DGC = 0;
}


function fillPropsFromTeam(gameData, teamData, suffix) {
    Object
        .getOwnPropertyNames(teamData)
        .filter(p => p !== 'players')
        .forEach(p => {
            gameData[p + suffix] = teamData[p];
        });
}


function fillNames(gameData, players, suffix) {
    for (let i = 0; i < 23; i++) {
        const key = 'name' + suffix + '_' + (i + 1);
        gameData[key] = (players.length > i) ? players[i].playerName : 'NA';
    }
}

const fillPlayerFields = ['MR', 'CB', 'DB', 'T', 'MT'];

function fillPlayerStats(gameData, players, suffix) {
    for (let i = 0; i < 23; i++) {
        const player = (players.length > i) && players[i];
        fillPlayerFields.forEach(p => {
            const key = p + suffix + '_' + (i + 1);
            gameData[key] = player ? player[p] : 'NA';
        })
    }
}


function countTeamDGC(team) {
    if (team.players.length) {
        team.DropGoalsConverted = team.players.reduce((a, x) => a + x.DGC, 0);
    } else {
        team.DropGoalsConverted = 'NA';
    }

}

function countTeamBP(team) {
    if (team.players.length) {
        let a = 0;
        team.players.forEach(x => {
            let y = x.YC;
            if (y > 1 && x.RC > 0) {
                y = 1;
            }
            a += 10 * y + 25 * x.RC;
        });
        team.BookingPoints = a;
    } else {
        team.BookingPoints = 'NA';
    }
}

function countTeamStats(team) {
    countTeamDGC(team);
    countTeamBP(team);
}

function fillTable(gameData) {

    countTeamStats(gameData.homeTeam);
    countTeamStats(gameData.awayTeam);

    fillNames(gameData, gameData.homeTeam.players, '_h');
    fillNames(gameData, gameData.awayTeam.players, '_a');

    fillPropsFromTeam(gameData, gameData.homeTeam, '_h');
    fillPropsFromTeam(gameData, gameData.awayTeam, '_a');

    fillPlayerStats(gameData, gameData.homeTeam.players, '_h');
    fillPlayerStats(gameData, gameData.awayTeam.players, '_a');

}

function getGameImageToWrite(gameData) {
    const out = {};
    Object.getOwnPropertyNames(gameData)
        .filter(p => (ignoreGameKeys.indexOf(p) < 0))
        .forEach(p => out[p] = gameData[p]);
    return out;
}


function saveErrorToFile(error, requestedDate) {
    const errorFile = fs.createWriteStream("errors.txt", {flags: 'a'});
    const message = '\n' + new Date().toISOString() + ': for ' + requestedDate + ': ' + (error ? (error.message || error) : 'UNKNOWN ERROR');
    errorFile.write(message, () => {
        errorFile.end()
    });
}