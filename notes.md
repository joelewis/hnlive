### Realtime Hacker News Activity Indicator

#### What is the metrics used?
The rate of change of comments count & upvotes is considered as the metric.
More the comments & upvotes fluctuate, more the activity.

#### How exactly is the activity computed?
The top stories are grabbed from the official [HN API](https://hacker-news.firebaseio.com/v0/topstories.json).
```
Cumulative Score = sum(no of comments, no of votes) (for all top stories)
```
This score is calculated, every 60 seconds.
The fluctuation of this values, gives an indication of the activity level on the site.

#### How is the fluctuation calculated?
where `t` is time,  
`F(t) = cumulative_score @ time t`  
`fluctuation = |F(t) - F(t-1)|`
A `log(fluctuation)` is taken to generate actual datapoints for the graph. This is to minize the bandwidth of the data series. 
Also, [Savitzky-Golay](https://in.mathworks.com/help/curvefit/smoothing-data.html#bq_6ys3-2) filter is applied on the data series to smooth the graph. 


### Disclaimer
This is just a very rough, approximate sketch of the activity on the site. It doesn't aim to be the most accurate indicator and cannot be taken as precise data for serious projects. 
