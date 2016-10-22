var CronJob = require('cron').CronJob;
var Sequelize = require('sequelize');
var deferred = require('deferred');
var najax = require('najax');
var _ = require('underscore-node');
var moment = require('moment');
require('dotenv').config() // load config vars from .env into process.env

var currentTimezone = moment(new Date()).format('Z');
var sequelize = new Sequelize(process.env.DATABASE_URL, {
    timezone: currentTimezone
});

var maxDataLength = 86400; //12;
var updateInterval = 60000;

// API Ends
var topStoriesAPI = "https://hacker-news.firebaseio.com/v0/topstories.json";
var itemAPI = "https://hacker-news.firebaseio.com/v0/item/{{itemId}}.json";
var algoliaFrontPageAPI = "http://hn.algolia.com/api/v1/search?tags=front_page";

var DataPoint = sequelize.define('datapoint', {
  variance: Sequelize.INTEGER,
  time: Sequelize.DATE,
  diff: Sequelize.BOOLEAN
});

DataPoint.sync().then(function() {
    console.log('datapoints - table ready!');
});

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

var Firebase = function() {
    var prevStories = [];
    var prevScore = 0;
    
    var getFrontPageStories = function(cb) {
        najax.get(topStoriesAPI).then(function(resp, status) {
            var top = status === "success" ? JSON.parse(resp) : [];
            var top = top.slice(0, 30);
            cb(top);
        });
    };
    
    var getCurrentScore = function(cb) {
        var requestCounter = 0;
        var req = [];
        
        
        getFrontPageStories(function(ids) {
            var timeoutval = 0;
            var requests = [];
            var allRequestsSent = deferred();
                
            var interval = null;
            
            interval = setInterval(function() {
                if (! ids.length) {
                    clearInterval(interval);
                    allRequestsSent.resolve(requests);
                    return; 
                }
                var id = ids.shift();
                var dfd = deferred();
                najax.get(itemAPI.replace('{{itemId}}', id), function(resp) {
                        dfd.resolve(JSON.parse(resp));
                });
                requests.push(dfd.promise);
            }, 500);
                    
            allRequestsSent.promise.then(function(requests) {
                deferred.apply(deferred, requests).then(function() {
                    var stories = arguments[0];

                    var diff = false; 
                    
                    var currentIds = stories.map(function(story) {
                        return story.id;
                    });
                    
                    var arrdiff = arrayDiff(prevStories, currentIds);
                    if (prevStories.length && (arrdiff.insertions.length || arrdiff.deletions.length)) {
                        diff = true;
                    }

                    var totalScore = stories.map(function(story) {
                        var score = story.score + story.descendants;
                        return  score ? score : 0;
                    }).reduce(function(prev, next) {
                        return prev + next;
                    });
                    
                    prevStories = currentIds;
                    prevScore = totalScore
                    cb(totalScore, diff);
                }).catch(function(errors) {
                    console.log(errors);
                });
            })
        });
    };
    
    return {
        getFrontPageStories: getFrontPageStories,
        getCurrentScore: getCurrentScore
    }
}

var fb = new Firebase();

var arrayDiff = function(arr1, arr2) {
    var additions = []; // additions are elements present in arr2 that's not in arr1
    var deletions = []; // deletions are elements not present in arr2 that's present in arr1
    insertions = arr2.filter(function(item) {
        return arr1.indexOf(item) < 0;
    });
    deletions = arr1.filter(function(item) {
        return arr2.indexOf(item) < 0;
    });
    return {insertions: insertions, deletions: deletions};
};



var updateData = function() {
    fb.getCurrentScore(function(score, diff) {
        var xValue = new Date().getTime();
        var yValue = score;
        sequelize.query('SELECT COUNT(*) FROM datapoints').then(function(results) {
            var cursor = results[0];
            var count = cursor[0].count;
            if (count > maxDataLength) {
                console.log('count greater than maxlength. Deleting first row.');
                DataPoint.findOne().then(function(dp) {
                    dp.destroy();
                });
            }
        }).catch(function(errors) {
            console.log(errors);
        });
        
        console.log('saving data point.');
        var datapoint = DataPoint.create({
            variance: yValue,
            time: xValue,
            diff: diff
        }).then(function(stat) {
            console.log('data point saved.');
        }).catch(function(errors) {
            console.log(errors);
        });
    })
};

var getDp = new CronJob({
  cronTime: '*/60 * * * * *',
  onTick: updateData,
  start: false,
  timeZone: currentTimezone
});
getDp.start();
