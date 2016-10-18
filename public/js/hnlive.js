var dps = [], realtimeChart, lastWeekChart;
var lastWeekActivity = [];
var lastWeek = [];
var averageWeekDay = [];
var yesterday = [];
var averageTimeSlot = [];

var updateChart = function() {
    $.get('/variance').then(function(resp) {
        var datapoints = resp.datapoints;
        var datapoints = datapoints.map(function(dp) {
            return {
                x: new Date(dp.time).getTime(),
                y: dp.variance
            };
        })
        dps.splice(0, dps.length);
        _.each(datapoints, function(dp) {
            dps.push(dp);
        });
        realtimeChart.render();
    });
};

var updateLastWeekChart = function() {
    $.get('/lastweek').then(function(resp) {
        var datapoints = _.map(resp.lastWeekActivity, function(dp, key) {
            return {
                legendText: key,
                indexLabel: key,
                y: dp.average,
                label: key
            };
        })
        
        // empty contents of lastWeekActivity;
        lastWeekActivity.splice(0, lastWeekActivity.length); 
        
        _.each(datapoints, function(dp) {
            lastWeekActivity.push(dp);
        });
        
        lastWeekChart.render();
    });
};

$(function() { // dom init
    realtimeChart = new CanvasJS.Chart("realtime", {
        theme: 'theme1',
        type: 'doughnut',
        axisX:{  
            title: 'time',
            valueFormatString: "hh TT DDDD MMM",
            gridThickness: 1,
        },
        
        axisY: {
            gridThickness: 1,
            title: 'activity',
        },
        
        data: [{
            type: "area",
            dataPoints: dps,
            xValueType: 'dateTime',
            showInLegend: true,
            name: 'Activity @ https://news.ycombinator.com/news'
        }],
        legend:{
            cursor:"pointer",
        }
    });
    
    lastWeekChart = new CanvasJS.Chart("lastweek", {
        axisX:{  
            title: 'day of week',
        },
        
        axisY: {
            title: 'activity',
        },
        
        data: [{
            type: "column",
            dataPoints: lastWeekActivity,
            showInLegend: true,
            name: 'Activity @ https://news.ycombinator.com/news'
        }],
        legend:{
            cursor:"pointer",
        }
    });
    
    realtimeChart.render();
    // update every 5 seconds.
    updateChart();
    updateLastWeekChart();
    setInterval(updateChart, 30000);
});
