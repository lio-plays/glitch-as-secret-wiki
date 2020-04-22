var express = require("express");
var passport = require("passport");
var Strategy = require("passport-local").Strategy;
var db = require("./db");

const fsp = require("fs").promises;
const auth = require("connect-ensure-login");
const session = require("express-session");
var FileStore = require("session-file-store")(session);

// Configure the local strategy for use by Passport.
//
// The local strategy require a `verify` function which receives the credentials
// (`username` and `password`) submitted by the user.  The function must verify
// that the password is correct and then invoke `cb` with a user object, which
// will be set at `req.user` in route handlers after authentication.
passport.use(
  new Strategy(function(username, password, cb) {
    db.users.findByUsername(username, function(err, user) {
      if (err) {
        return cb(err);
      }
      if (!user) {
        return cb(null, false);
      }
      if (user.password != password) {
        return cb(null, false);
      }
      return cb(null, user);
    });
  })
);

// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  The
// typical implementation of this is as simple as supplying the user ID when
// serializing, and querying the user record by ID from the database when
// deserializing.
passport.serializeUser(function(user, cb) {
  cb(null, user.id);
});

passport.deserializeUser(function(id, cb) {
  db.users.findById(id, function(err, user) {
    if (err) {
      return cb(err);
    }
    cb(null, user);
  });
});

// Create a new Express application.
var app = express();

// Configure view engine to render EJS templates.
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");

// Use application-level middleware for common functionality, including
// logging, parsing, and session handling.
app.use(require("morgan")("combined"));
app.use(require("body-parser").urlencoded({ extended: true }));

//
exports.run = function run(opts) {
  //
  const root = opts.root;

  app.use(
    session({
      store: new FileStore({ path: root + "/.data/sessions" }),
      secret: process.env.SECRET // same as password for now
      // reSave, saveUninitialized default
    })
  );

  // Initialize Passport and restore authentication state, if any, from the
  // session.
  app.use(passport.initialize());
  app.use(passport.session());

  // Define routes.
  app.get("/login", function(req, res) {
    res.render("login");
  });

  app.post(
    "/login",
    passport.authenticate("local", {
      successReturnToOrRedirect: "/",
      failureRedirect: "/login"
    }),
    function(req, res) {
      res.redirect("/");
    }
  );

  app.get("/logout", function(req, res) {
    req.logout();
    res.redirect("/");
  });

  app.get("/profile", auth.ensureLoggedIn(), function(req, res) {
    res.render("profile", { user: req.user });
  });

  async function html(req, res, subpath, notLoggedInContent) {
    const path = root + subpath;
    if (notLoggedInContent && !req.user) {
      var content = await fsp.readFile(
        __dirname + "/html/not-logged-in.html",
        "utf8"
      );
    } else {
      var content = await fsp.readFile(path, "utf8");
    }
    if (req.user) {
      var login = `<a href="/profile"><b>${req.user.username.replace(
        /</g,
        "&lt;"
      )}'s menu</b></a>`;
    } else {
      var login = `<a href="/login">Login</a>`;
    }
    content = content.replace("$LOGIN$", login);
    res.send(content);
  }

  async function raw(req, res, type, notLoggedInContent) {
    const path = root + req.path;
    if (notLoggedInContent && !req.user) {
      var content = notLoggedInContent;
    } else {
      var content = await fsp.readFile(path, "utf8");
    }
    res.type(type);
    res.send(content);
  }

  app.get("/", function(req, res) {
    html(req, res, "/index.html");
  });

  // protected

  app.get(/\/private\/.*\.html/, function(req, res) {
    html(req, res, req.path, true);
  });

  app.get(/\/private\/.*\.js$/, auth.ensureLoggedIn(), function(req, res) {
    raw(req, res, ".js", "alert('private, no login, no javascript'");
  });

  app.get(/\/private\/.*\.md$/, function(req, res) {
    raw(req, res, ".txt", "# private and not logged in");
  });

  // public

  app.get(/.*\.html$/, function(req, res) {
    html(req, res, req.path);
  });

  app.get(/.*\.js$/, function(req, res) {
    raw(req, res, ".js");
  });

  app.get(/.*\.md$/, function(req, res) {
    raw(req, res, ".txt");
  });

  app.listen(3000);
};
