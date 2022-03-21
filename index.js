const { App } = require("@slack/bolt");
const { WebClient } = require('@slack/web-api');
const { createEventAdapter } = require('@slack/events-api');
const mysql = require("mysql");
const dotenv = require('dotenv');

const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
const slackToken = process.env.SLACK_TOKEN;
const port = process.env.PORT || 5001;


const slackEvents = createEventAdapter(slackSigningSecret);
const slackClient = new WebClient(slackToken);

const mySqlHost = process.env.SQL_HOST;
const mySqlUser = process.env.SQL_USER;
const mySqlPass = process.env.SQL_PASSWORD;
const mySqlDatabase = process.env.SQL_DATABASE;


const db_config = {
  host: mySqlHost,
  user: mySqlUser,
  password: mySqlPass,
  database: mySqlDatabase
}

let db;

function handleDisconnect() {
    console.log('handleDisconnect()');
    db = mysql.createConnection(db_config); // Recreate the connection, since
                                                    // the old one cannot be reused.
    db.connect(function(err) {              // The server is either down
    if(err) {                                      // or restarting (takes a while sometimes).
        console.log(' Error when connecting to db:', err);
        setTimeout(handleDisconnect, 2000);         // We introduce a delay before attempting to reconnect,
    }                                               // to avoid a hot loop, and to allow our node script to
    });                                             // process asynchronous requests in the meantime.
                                                    // If you're also serving http, display a 503 error.

    db.on('error', function(err) {
        console.log('db error: ' + err);
        if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
            handleDisconnect();                       // lost due to either server restart, or a
        } else {                                      // connnection idle timeout (the wait_timeout
            throw err;                                // server variable configures this)
        }
    });

}

handleDisconnect();



slackEvents.on('app_mention', (event) => {
  console.log(`Got message from user ${event.user}: ${event.text}`);
  console.log(event);

  

  Promise.all([
    (async () => {
      const realName = await getUserName(event.user);

      const sqlInsert = `INSERT INTO saved_comments (user, comment) VALUES ('${realName}', '${cleanString(event.text)}');`
  
      await db.query(sqlInsert, (error, result) => {
        if (error) throw error;

      });
  })(),
  (async () => {
      try { 
        console.log("Message saved");
        await slackClient.chat.postMessage({ channel: event.channel, text: `<@${event.user}>! Message saved!` })
      } catch (error) {
        console.log(error.data)
      }
    })()

  ]);


});

const cleanString = (str) => {
  let cleanString = str.replace('<@U033521BD5W>', "").replace(/`/g, "").trim();
  return cleanString;
}


const getUserName = async (userId) => {

  try {
  // Call the users.info method using the WebClient
  const result = await slackClient.users.info({
    user: userId
  });

  return await ( result.user.profile.real_name_normalized)
}
catch (error) {
  console.error(error);
}
}

slackEvents.start(port).then(() => {
  console.log(`SlackEvents Server started on port ${port}`)
});

slackEvents.on('error', console.error);

