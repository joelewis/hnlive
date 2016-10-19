# Live Hacker News Activity Meter

# How To Run The Server

1. Clone the repository.
2. `cd` into the cloned repository.
3. Install dependency libraries - `npm install`
3. Create `.env` file and put the below settings in it (Modify the settings to suit yours).
````
DATABASE_URL=mysql://username:password@localhost:3306/dbname
SECRET_KEY=somesecretkey
```
4. Start the cron job that collects & computes data: `node startcron.js`
5. Run server: `node index.js` or your favourite node process manager.
