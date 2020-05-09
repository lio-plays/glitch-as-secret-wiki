const express = require("express");
const passport = require("passport");
const Strategy = require("passport-local").Strategy;
const db = require("./db");

const fs = require("fs");
const fsp = require("fs").promises;
const auth = require("connect-ensure-login");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const pathTools = require("path");

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
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false
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

  function esc(s) {
    return s.toString().replace("<", "&lt;");
  }

  function sendNotFound(req, res) {
    res
      .status(404)
      .send(
        `Sorry can\'t find ${esc(
          req.path
        )}<hr><a href="/index.html">Home</a> <a href="https://glitch.com/edit/#!/${esc(
          process.env.PROJECT_NAME
        )}">Glitch</a>`
      );
  }

  async function html(req, res, subpath, notLoggedInContent) {
    const path = root + subpath;
    if (notLoggedInContent && !req.user) {
      var content = await fsp.readFile(
        __dirname + "/html/not-logged-in.html",
        "utf8"
      );
    } else {
      try {
        var content = await fsp.readFile(path, "utf8");
      } catch (e) {
        sendNotFound(req, res);
        return;
      }
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
      try {
        var content = await fsp.readFile(path, "utf8");
      } catch (e) {
        sendNotFound(req, res);
        return;
      }
    }
    res.type(type);
    res.send(content);
  }

  app.get("/", function(req, res) {
    html(req, res, "/index.html");
  });

  // webedit

  function webeditRejected(res, path1) {
    const path = pathTools.normalize(path1);
    if (!path.match(/\/web-editable\//)) {
      res.send(
        'File not web-editable! <br> Go <button type="button" onclick="javascript:history.back()">Back</button> or <a href="/index.html">Home</a>'
      );
      return true;
    }
  }
  app.get("/webedit", auth.ensureLoggedIn(), async function(req, res) {
    const fn = req.query.file;
    if (!req.query.forced && webeditRejected(res, fn)) {
      return;
    }
    const fc = await fsp.readFile(root + "/" + req.query.file, "utf8");
    res.render("webedit", {
      myUrl: req.path,
      editPath: req.query.file,
      backPath: fn.match(/\.md$/) ? "/#" + fn : fn,
      fileContent: fc,
      date: new Date().getTime()
    });
  });

  app.post("/webedit", auth.ensureLoggedIn(), function(req, res) {
    if (webeditRejected(res, req.body.path)) {
      return;
    }
    fs.writeFileSync(root + req.body.path, req.body.text);
    console.log(req.body.path + " saved");
    res.redirect(`/webedit?file=${req.body.path}`);
  });

  // protected

  app.get(/\/private\/.*\.html/, function(req, res) {
    html(req, res, req.path, true);
  });

  app.get(/\/private\/.*\.js$/, function(req, res) {
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

  app.use(function(err, req, res, next) {
    console.error(err.stack);
    let msg = `Something broke! <a href="/index.html">Home</a> <a href="https://glitch.com/edit/#!/${process.env.PROJECT_NAME}">Glitch</a>`;
    if (req.user) {
      msg += `<hr>You are logged in, the error:<pre>${err.stack
        .toString()
        .replace("<", "&lt;")}</pre>`;
    }
    res.status(500).send(msg);
  });

  app.use(sendNotFound);

  app.listen(3000);
};
