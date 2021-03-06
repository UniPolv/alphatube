const express = require('express');
	cors = require('cors');				//~ Module required for Cross-Origin-Resource-Sharing policy
	path = require('path');
	jsonDB = require('node-json-db');	//~ Module that implements a json based database
	port = 8000;
	twitter = require('twit');
var process = require('process');
	bodyParser = require('body-parser');
	atlas = express();

// Fix path
process.env.PWD = path.join(path.dirname(process.argv[1]), '..');
process.chdir(process.env.PWD);
// ~ __dirname = process.env.PWD;
// ~ __filename = process.argv[1];



/* read twitter keys from environment variables
 * create a file '.env' in './server/' directory
 * put your keys as this
 *
 * CONSUMER_KEY=*************************
 * CONSUMER_SECRET=**************************************************
 * ACCESS_TOKEN=**************************************************
 * ACCESS_TOKEN_SECRET=*********************************************
*/
require('dotenv').config({ path: process.env.PWD + '/server/.env' });	// after fix path


// CORS
var whitelist = ['site1826', 'gabriele.fulgaro', 'mattia.polverini', 'arianna.avoni', 'francesco.fornari2'];
for (i in whitelist) {
	whitelist[i] = 'http://' + whitelist[i] + '.tw.cs.unibo.it'
}
whitelist.push('http://localhost:8000');	// in localhost the origin is undefined (
whitelist.push(undefined);					// twitter api

var corsOption = {
	methods: ['GET','PUT'],
	allowedHeaders: ['Content-Type'],
	origin: function (origin, callback) {
		if (whitelist.indexOf(origin) !== -1) {
			callback(null, true)
		} else {
			callback(new Error('Not allowed by CORS'))
		}
	},
	optionSuccessStatus: 200 //Legacy browser (IE 11) support
}


//~ Server setup
atlas.use(cors());										// allowed all by default
atlas.use(bodyParser.urlencoded({ extended: false }));	// allow urlencoded parsing
atlas.use(bodyParser.json());							// allow json parsing
atlas.use(express.static('alphatube'));
atlas.use(express.static('documentation'));


//~ JSON-DB - Initialization procedure
//~ If db file is present, conect to it else create it.
//~ The db purpouse is to track videos watched by the individual user
var db = new jsonDB("./db", true, true);
try {
	db.getData("/dbIndex");	// index (popularity) of keys of database
} catch {
	db.push("/dbIndex",{});	// if index don't exists we create it
}


// ~ atlas.options('*',cors(corsOption));

//~ Routes management
atlas.get('/globpop', function(req, res) {
	var nReturned = 30;

	var response = {
		site: req.headers.host,
		recommender: '',
		lastWatched: 'Never watched.',
		recommended: []
	}

	//~ This is Relative Global Popularity implementation.
	//~ This part of code is axecuted only when a valid YouTube ID is specified in the URI site1826.tw.cs.unibo.it/globpop?id=YYYYYY
	if (req.query.id){
        try{
			//~ This database access will throw an error if specified key is not present
            var idData = db.getData('/' + req.query.id);
            //~ Response JSON is builded up fields by fields
            response.recommender =  req.query.id;
            response.lastWatched = idData.lastWatched;
            //~ Recommended array is buildedup using an empty array an pushing the video to keep the order
            for(let i = 0; i < idData.recommended.length && i < nReturned; i++) {
				response.recommended.push(
    		    	{
						videoId: idData.recommended[i].videoId,
    		    		timesWatched: idData.recommended[i].totalSelected,
    		    		lastSelected: idData.recommended[i].lastSelected,
    		    		prevalentReason: idData.recommended[i].from[0].prevalentReason
					}
				);
			}
        } catch (error) {
			res.statusCode = 404;
		}

	}else{
		// Absolute Globpop
    	try {
    		var order = db.getData(`/dbIndex`);		// Get popularity lists

    		// Navigate popularity keys from most to less popular
    		for (var i = Object.keys(order).length-1; i>= 0 && response.recommended.length < nReturned; i--){
			  // Navigate videoId
    		  for (var e = 0; e < Object.values(order)[i].length && response.recommended.length < nReturned; e++){

				var dbKey = db.getData("/" + Object.values(order)[i][e]);		// Get info about the video
    		    response.recommended.push(		// push the info into the respoce JSON
    		    	{
						videoId: Object.values(order)[i][e],
    		    		timesWatched: dbKey.timesWatched,
    		    		lastSelected: dbKey.lastWatched
					}
				);
    		  }
    		}
		} catch (error) {
			res.statusCode = 404;
		}
	}



	res.json( response );
});

atlas.put('/watched', cors(corsOption), (req, res) => {

	if (req.body.end) {
		const date = new Date().toUTCString();

		// CURRENT VIDEO
		try {
			var timesWatched = db.getData(`/${req.body.end}/timesWatched`);

			// Remove from index of old key
			var popularityIndex = db.getData(`/dbIndex/${timesWatched}`);	// get list of 'timesWatched' indx
			popularityIndex = popularityIndex.filter(val => val !== req.body.end);
			if (popularityIndex.length) db.push(`/dbIndex/${timesWatched}`, popularityIndex, true);		// if there are other overwrite
			else db.delete(`/dbIndex/${timesWatched}`);		// else delete key of object

		} catch(error) {
			timesWatched = 0;
		}

		// update video
		var current = {
			timesWatched: timesWatched+1,
			lastWatched: date,
			recommended: []
		}

		// insert id in index list
		try {
			popularityIndex = db.getData(`/dbIndex/${current.timesWatched}`);
			popularityIndex.push(req.body.end);
		}
		catch {
			popularityIndex = [req.body.end];
		}
		db.push(`/dbIndex/${current.timesWatched}`, popularityIndex);

		db.push("/" + req.body.end, current, false);



		// OLD VIDEO RELATION
		if (req.body.begin && req.body.reason) {
			try {
				var oldVideo = db.getData(`/${req.body.begin}`);

				// reason template
				var noReason = {
					prevalentReason: req.body.reason,
					timesSelected: 1
				}

				// video related template
				var noVideo = {
					videoId: req.body.end,
					totalSelected: 1,
					lastSelected: date,
					from: [
						noReason
					]
				}

				var newVideoIndex = oldVideo.recommended.findIndex(id => id.videoId == req.body.end);
				if (newVideoIndex < 0) oldVideo.recommended.push(noVideo);
				else {
					var newVideo = (oldVideo.recommended[newVideoIndex]);
					newVideo.totalSelected += 1;
					newVideo.lastSelected = date;


					var reasonIndex = newVideo.from.findIndex(reason => reason.prevalentReason == req.body.reason);
					if (reasonIndex < 0) newVideo.from.push(noReason);
					else newVideo.from[reasonIndex].timesSelected += 1;

					newVideo.from.sort((a, b) => (a.timesSelected < b.timesSelected) ? 1 : -1);			// sort reason array
					oldVideo.recommended.sort((a, b) => (a.lastSelected < b.lastSelected) ? 1 : -1);	// sort video array
				}
			} catch(error) {
				res.statusCode = 404;
				res.send('Not found');
			} finally {
				db.push(`/${req.body.begin}`, oldVideo, true);
			}
		}
	}
	else {
		res.statusCode = 400;
		res.send('Bad request');
	}
});


atlas.get('/twitter', cors(corsOption), (req, res) => {

	//~ Twitter requests need to pass through the server due to OAuth policy adopted by Twitter
	//~ Using twit npm package I'm able to build a complete request specifying keys and params
	var T = new twitter({
		consumer_key: process.env.CONSUMER_KEY,
		consumer_secret: process.env.CONSUMER_SECRET,
		access_token: process.env.ACCESS_TOKEN,
		access_token_secret: process.env.ACCESS_TOKEN_SECRET
	});

	//~ Performing a GET request to Twitter for retrive 24 tweets containg specified song title and artist name
	//~ ...and sending back to client
	T.get('search/tweets', {
		q: req.query.q_song + ' ' + req.query.q_artist,
		lang: 'en',
		result_type: 'mixed',
		count: 24
	}, (err, data, response) => {
		res.send(data);
	});
});

atlas.get('/globpopList', (req, res) => {
	res.sendFile(path.join(process.env.PWD, 'server/globpopList.json'));
});

atlas.get('/docs', (req, res) => {
	res.sendFile(path.join(process.env.PWD, 'documentation/index.html'));
});

atlas.get('*', (req, res) => {
	res.sendFile(path.join(process.env.PWD, 'alphatube/index.html'));		// sendFile need absolute path
});

//~ Server bindings to port and listening
atlas.listen(port, () => {
  console.log('Server started at port ' + port + '!');
});
