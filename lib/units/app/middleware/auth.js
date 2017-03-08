var jwtutil = require('../../../util/jwtutil')
var urlutil = require('../../../util/urlutil')

var dbapi = require('../../../db/api')

module.exports = function(options) {
  return function(req, res, next) {
    if (req.query.jwt) {
      console.log('******************************enter app/auth req.query.jwt');
      // Coming from auth client
      var data = jwtutil.decode(req.query.jwt, options.secret);
      var redir = urlutil.removeParam(req.url, 'jwt');
      if (data) {
        data.email=data.sub?data.sub.toString():data.email;
        data.name=data.sub?data.email:data.name;
        req.session.jwt = data;
        res.redirect(redir);
       /* // Redirect once to get rid of the token
        dbapi.saveUserAfterLogin({
            name: data.name
          , email: data.email
          , ip: req.ip
          })
          .then(function() {
            req.session.jwt = data;
            res.redirect(redir)
          })
          .catch(next)*/
      }
      else {
        // Invalid token, forward to auth client
        res.redirect(options.authUrl)
      }
    }
    else if (req.session && req.session.jwt) {
      console.log('******************************enter app/auth req.session.jwt:',req.session.jwt);
      dbapi.loadUser(req.session.jwt.email)
        .then(function(user) {
          console.log('loadUser.then:',user)
          if (user) {
            // Continue existing session
            req.user = user;
            next()
          }
          else {
            // We no longer have the user in the database
            res.redirect(options.authUrl)
          }
        })
        .catch(next)
    }
    //用于mat的接入
    else if (req.headers.authorization) {
      console.log('******************************enter app/auth req.headers.authorization')
      var authHeader = req.headers.authorization.split(' ');
      var format = authHeader[0];
      var token = authHeader[1];

      if (format !== 'Bearer') {
        return res.status(401).json({
          success: false
          , description: 'Authorization header should be in "Bearer $AUTH_TOKEN" format'
        })
      }
      if (!token) {
        log.error('Bad Access Token Header')
        return res.status(401).json({
          success: false
          , description: 'Bad Credentials'
        })
      }
      var data = jwtutil.decode(token, options.secret);
      if (!data) {
        return res.status(500).json({
          success: false
        })
      }

      data.email=data.sub.toString();
      data.name=data.email;
      //console.log('data:',data)
      req.session.jwt=data;
      dbapi.loadUser(data.email)
        .then(function(user) {
          if (user) {
            req.user = user
            next()
          }
          else {
            dbapi.saveUserAfterLogin({
              name: data.name
              , email: data.email
              , ip: req.ip
            })
              .then(function() {
                req.session.jwt = data
                next()
              })
              .catch(next)
          }
        })
        .catch(function(err) {
          console.error('app auth loadUser error:',err)
          return res.status(500).json({
            success: false
          })
        })
    }
      //用于浏览器端调试时默认登录
    else {
      // No session, forward to auth client
      //res.redirect(options.authUrl)
      console.log('******************************enter app/auth else')
      var token='eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjcwMywiaXNzIjoiaHR0cDpcL1wvZW10Yy5wYWN0ZXJhLmNvbTo5OTkxXC9hcGlcL2F1dGhlbnRpY2F0ZSIsImlhdCI6MTQ4MzM1NTI2MywiZXhwIjoxNDgzNzE1MjYzLCJuYmYiOjE0ODMzNTUyNjMsImp0aSI6IjVmNDgzYzk3MTIwNWMzZTM3ZTI1ODY4NGJhNWZlNjgzIn0.siy7Dd9xoXC0UZx8VgImHTKdd_WWYjHnmWK3xEJOeXE';
      console.log('app auth token:',token)
      console.log('redirect3')
      res.redirect( urlutil.addParams(req.url, {
        jwt: token
      }))
    }
  }
}
