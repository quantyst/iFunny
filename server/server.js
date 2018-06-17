const express = require('express'),
      massive = require('massive'),
      cors = require('cors'),
      bodyParser = require('body-parser'),
      session = require('express-session'),
      CTRL = require('./controller/controller.js'),
      passport = require('passport'),
      auth0Strategy = require('passport-auth0'),
      env = require('dotenv').config({path: './server/config/.env'}),
      app = express(),
      imageUpload = require('./aws/aws'),
      port = 3001,
      path = require('path');

app.use(cors());
app.use(bodyParser.json({limit: '50mb'}));

const corsOptions = {
  origin: function (origin, callback) {
    if (true) {
      console.log("origin is " + origin);
      callback(null, true);
    }
    else callback(new Error("Not Allowed by CORS"));
  },
  credentials: true
}

// database

massive({
  host:process.env.POSTGRES_HOST,
  port:process.env.POSTGRES_PORT,
  user:process.env.POSTGRES_USER,
  database:process.env.POSTGRES_DATABASE,
  password:process.env.POSTGRES_PASSWORD,
  ssl:true
}, { scripts: __dirname + '/db' }).then(db => {
  app.set('db', db);
});

// sessions

app.use(session({
  secret: process.env.SERVER_SECRET,
  resave: false,
  saveUninitialized: false,
}));

app.use(express.static(__dirname + '/../build'));
// auth0 section

app.use(passport.initialize());
app.use(passport.session());

passport.use(new auth0Strategy({
  domain: process.env.AUTH_DOMAIN,
  clientID: process.env.AUTH_CLIENT_ID,
  clientSecret: process.env.AUTH_CLIENT_SECRET,
  callbackURL: process.env.AUTH_CALLBACK,
}, function(accessToken, refreshToken, extraParams, profile, done) {
  const db = app.get('db')
  db.findUser([(profile.identities[0].user_id).toString()]).then((response)=>{
    if (response[0]) {
        return done(null, { user_id: response[0].user_id })
    } else {
      let email = '',
          picture = '',
          subscriptions = 0,
          subscribers = 0,
          memes = 0,
          likes = 0,
          comments = 0,
          username = '',
          headline = '',
          userId = '',
          name = '';
          
      if (profile.displayName) {
        name = profile.displayName;
      } else if (profile.name.givenName && profile.name.familyName) {
        name = profile.name.givenName + ' ' + profile.name.familyName;
      }
      if (profile.identities[0].user_id) {
        userId = profile.identities[0].user_id;
      } else if (profile.id) {
        userId = profile.id;
      }
      if (profile.picture) {
        picture = profile.picture;
      }
      if (profile.email) {
        email = profile.email;
      } else if (profile.emails[0].value) {
        email = profile.emails[0].value;
      }
      db.createUser([email, picture, subscriptions, subscribers, memes, likes, comments, username, headline, userId, name]).then((response)=>{
        return done(null, { user_id: response[0].user_id })
      })
    }
  })
}));

passport.serializeUser(function (user, done) {
  console.log('SERIALIZING');
  done(null, user);
})

passport.deserializeUser(function (obj, done) {
  console.log('DESERIALIZING')
  const db = app.get('db');
  db.findUser([obj.user_id]).then((response) => { 
      return done(null, response[0])
  })
})

// endpoints

app.get('/auth', (req, res, next) => {
  console.log("start authentication");
  next();
}, passport.authenticate('auth0'));

app.get('/auth/callback', passport.authenticate('auth0', {
  successRedirect: process.env.AUTH_SUCCESS,
  failureRedirect: process.env.AUTH_FAILURE
}))

app.get('/auth/me', cors(corsOptions), (req, res) => {
  if (!req.user) {
    console.log("USER NOT FOUND");
    res.status(404).send('USER NOT FOUND');
  }
  else {
    console.log("USER FOUND");
    res.status(200).send(req.user);
  }
});


app.get('/auth/logout', (req, res) => {
  req.logOut();
  res.redirect(302,  process.env.REACT_APP_HOST)
})
// GET REQUESTS
app.get('/api/getTopComments/:id', CTRL.getTopComments); // getting top comments by url meme id. 
app.get('/api/getMainSearches', CTRL.getMainSearches); // getting popular seatches within certain date. 
app.get('/api/getUserSearchResults', CTRL.getUserSearchResults); // getting usernames by user input. 
app.get('/api/getRecentSearches', CTRL.getRecentSearches); // getting recent searches by user id. 
app.get('/api/getSearchResults', CTRL.getSearchResults); // getting tags by user input. 
app.get('/api/getResults', CTRL.getResults); // getting number of results found by tag. 
app.get('/api/getMemesByTag', CTRL.getMemesByTag); // getting memes by tag. 
app.get('/api/getTrendingTags', CTRL.getTrendingTags); // getting tags by number of times they appear within certain date.
app.get('/api/checkLikes/:userid', CTRL.checkLikes); // getting liked memes by user id.
app.get('/api/getMemes', CTRL.getMemes); // getting memes to display in collective.
app.get('/api/getFeaturedMemes', CTRL.getFeaturedMemes); // getting memes to display in featured.
app.get('/api/likes/:memeid/:userid', CTRL.checkMemeLikes); // getting liked memes by user and meme id.
app.get('/api/checkCommentLikes/:memeid/:userid', CTRL.checkCommentLikes); // getting liked comments by user id and meme id
app.get('/api/getReplies/:id', CTRL.getReplies); // getting replies by comment id.
// app.get('/api/getUserProfile/:id', CTRL.getUserProfile); // getting profile page by user id.
app.get('/api/getMemeDetails/:id', CTRL.getMemeDetails); // getting meme details by meme id. ()
app.delete('/api/deleteRecentSearches', CTRL.deleteRecentSearches);
app.delete('/api/deleteComment/:memeid/:replyid', CTRL.deleteComment);
app.delete('/api/deleteMeme/:memeid/:exactid', CTRL.deleteMeme);
app.post('/api/postRecentSearch', CTRL.postRecentSearch);
app.post('/api/unlike/:memeid', CTRL.unlikeMeme);
app.post('/api/like/:memeid', CTRL.likeMeme);
app.post('/api/featuredUnlike/:memeid', CTRL.featuredUnlikeMeme);
app.post('/api/featuredLike/:memeid', CTRL.featuredLikeMeme);
app.post('/api/commentUnlike/:commentid', CTRL.unlikeComment);
app.post('/api/commentLike/:commentid', CTRL.likeComment);
app.post('/api/submitUsername', CTRL.submitUsername);
app.post('/api/postMeme', CTRL.postMeme);
app.post('/api/featureMeme', CTRL.featureMeme);
app.post('/api/unfeatureMeme', CTRL.unfeatureMeme);
app.post('/api/postComment', CTRL.postComment);
app.post('/api/postReply', CTRL.postReply);
app.post('/api/upload',(req, res) => {
  imageUpload.sendPics(req.body.pic, (response, err) => {
    if (err) {
      console.log("IMAGE UPLOAD ERRROR")
      console.log(err);
      res.status(500).end();
    }
      res.status(200).send(response);
  })
})
// finish

// app.get('*', (req, res)=>{
//   console.log(req.originalUrl)
//   res.sendFile(path.join(__dirname, '../build/index.html'));
// })

app.listen(port, ()=> console.log(`listening on port ${port}`));