var express = require('express');
var app = express();
var deferred = require('deferred');
var najax = require('najax');
var _ = require('underscore-node');
var SG = require('ml-savitzky-golay');

var Sequelize = require('sequelize');
var env = 'DEVELOPMENT';
process.env.PWD = process.cwd();

if (process.env.DATABASE_URL) {
    env = 'PRODUCTION';
}

if (env == 'PRODUCTION') {
    var db_url = process.env.DATABASE_URL;
} else {
    var db_url = "postgresql://joe-2744@localhost:5432/hnlive";
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
                    console.log('additions: ');
                    console.log(arrdiff.insertions.length);
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

var updateData = function() {
    fb.getCurrentScore(function(score, diff) {
        var xValue = new Date().getTime();
        var yValue = score;
        console.log(score);
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
            console.log('datapoint save failed.');
            console.log(errors);
        });
    })
};

var updateStats = function() {
    var currentTime = new Date();
    var shouldRecord = currentTime.getUTCHours() == 23 && (currentTime.getUTCMinutes() >= 29 && currentTime.getUTCMinutes() < 59);
    if (shouldRecord) {
        // find average of today, by getting all data points within 24 hours span backwards
        sequelize.query('SELECT * from datapoints where time > current_date - 1', {model: DataPoint})
        .then(function(dps) {
            var average = dps.map(function(dp) {
                return dp.variance;
            }).reduce(function(prev, next) {
                return prev + next;
            }) / dps.length;
            
            
            console.log('saving stat for the day.');
            var stat = Stat.create({
                average: average,
                day: new Date().getTime()
            }).then(function(stat) {
                console.log('stat saved.');
            }).catch(function(errors) {
                console.log('saving stat for the day failed.');
                console.log(errors);
            });
        });
    }
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

app.listen(process.env.PORT || 4000, function () {
  console.log('app listening on port 4000!');
});

updateData();
setInterval(updateData, updateInterval);
setInterval(updateStats, 30 * 60000); // update stats everyday
