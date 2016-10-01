var express = require('express');
var app = express();
var deferred = require('deferred');
var najax = require('najax');
var _ = require('underscore-node');
var SG = require('ml-savitzky-golay');
var Sequelize = require('sequelize');
var CronJob = require('cron').CronJob;

var env = 'DEVELOPMENT';
process.env.PWD = process.cwd();

if (process.env.DATABASE_URL) {
    env = 'PRODUCTION';
}

if (env == 'PRODUCTION') {
    var db_url = process.env.DATABASE_URL;
} else {
    var db_url = 'mysql://root:lewis@localhost:3306/hnlive';
    // var db_url = "postgresql://joe-2744@localhost:5432/hnlive";
}

var sequelize = new Sequelize(db_url);
app.secretkey = 'joe';
var maxDataLength = 86400; //12;

// first define the model
var DataPoint = sequelize.define('datapoint', {
  variance: Sequelize.INTEGER,
  time: Sequelize.DATE,
  diff: Sequelize.BOOLEAN
});

var Stat = sequelize.define('daystats', {
    average: Sequelize.INTEGER,
    day: Sequelize.DATE
});

DataPoint.sync().then(function() {
    console.log('datapoints - table ready!');
});

Stat.sync().then(function() {
    console.log('daystats - table ready!');
});

// API Ends
var topStoriesAPI = "https://hacker-news.firebaseio.com/v0/topstories.json";
var itemAPI = "https://hacker-news.firebaseio.com/v0/item/{{itemId}}.json";
var algoliaFrontPageAPI = "http://hn.algolia.com/api/v1/search?tags=front_page";

var updateInterval = 60000;

var getClosestSmoothVariance = function(dps, i) {
    while (i > 1) {
        var current = dps[i];
        var prev = dps[i-1];
        
        if (!prev.diff && !current.diff) {
            var changeMagnitude = Math.abs(current.variance - prev.variance);
            changeMagnitude = changeMagnitude === 0 ? 0 : Math.log(changeMagnitude);
            return changeMagnitude;
        }
        
        i--;
    }
    
    return 0;
};

app.use('/static', express.static(process.env.PWD+'/public'));

app.get('/variance', function (req, res) {
  // stream past 24 hours HN activity data points;
  sequelize.query('SELECT * FROM datapoints WHERE time > current_date - 1 ORDER BY time desc', {model: DataPoint})
    .then(function(dps) {
        var varianceDps = [];
        
        if (! dps.length) {
            return res.json({datapoints: []});
        }
        
        for (var i=1; i<dps.length; i++) {
            var varianceDp = {                
                time: dps[i].time,
                diff: dps[i].diff
            };
            
            varianceDp.variance = getClosestSmoothVariance(dps, i);
            varianceDps.push(varianceDp);
        }
        
        var sharpSignals = varianceDps.map(function(dp) {
            return dp.variance;
        });
        
        var smoothSignals = SG(sharpSignals, 1, {derivative: 0});

        // var smoothSignals = SG(smoothSignals, 1, {derivative: 0});
        // var smoothSignals = SG(smoothSignals, 1, {derivative: 0});
        // var smoothSignals = SG(smoothSignals, 1, {derivative: 0});
        
        var varianceDps = varianceDps.map(function(dp, i) {
            dp.variance = smoothSignals[i];
            return dp;
        });
        
        //return res.json({datapoints: varianceDps});
        return res.json({datapoints: varianceDps});
    });
});

app.get('/reset/:secretkey', function (req, res) {
    // drops all tables. authenticate with a secret key.
    var secretkey = req.params.secretkey;
    if (secretkey === app.secretkey) {
        DataPoint.sync({force: true}).then(function(){
            Stat.sync({force: true}).then(function() {
                return res.json({'status': 'success'});
            });
        });
    } else {
        return res.json({'status': 'failure'});
    }
});

app.listen(process.env.PORT || 4000, '127.0.0.1', function () {
  console.log('app listening on port 4000!');
});
