"use strict";

var Swarm = module.exports = {};

Swarm.env = require('./env');
Swarm.Spec = require('./Spec');
Swarm.LongSpec = require('./LongSpec');
Swarm.Syncable = require('./Syncable');
Swarm.Model = require('./Model');
Swarm.Set = require('./Set');
//Swarm.Vector = require('./Vector');
Swarm.Host = require('./Host');
Swarm.Pipe = require('./Pipe');
Swarm.Storage = require('./Storage');
Swarm.SharedWebStorage = require('./SharedWebStorage');
Swarm.WebSocketStream = require('./WebSocketStream');
Swarm.ReactMixin = require('./ReactMixin');

Swarm.get = function (spec) { return Swarm.env.localhost.get(spec); }