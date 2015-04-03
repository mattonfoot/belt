var util = require("util")
  , events = require("events")
  , uuid = require('uuid');


function Wrapper( db ) {
  this.db = db;

  this.docs = {};

  this.changes = this.db.changes({
    include_docs: true,
    since: 'now',
    live: true
  });

  watchForChanges( this.changes, this );

  events.EventEmitter.call( this );
}

util.inherits( Wrapper, events.EventEmitter );

Wrapper.prototype.constructor = Wrapper;

Wrapper.prototype.post = function( data, cb ) {
    if (!data.uuid) {
      data.uuid = uuid.v4();
    }

    this.db.post( data, function( err, info ) {
        return cb && cb( err, info );
    });
  };

  Wrapper.prototype.put = function( data, id, rev, cb ) {
    this.db.put( data, id, rev, function( err, info ) {
        return cb && cb( err, info );
    });
  };

  Wrapper.prototype.bulkDocs = function( updates, cb ) {
    this.db.bulkDocs( updates, function( err, info ) {
        return cb && cb( err, info );
    });
  };

  Wrapper.prototype.remove = function( id, rev, cb ) {
    var cache = this;
    var done = false;

    delete cache.docs[ id ];

    cache.changes
      .on('delete', function( ev ) {
        var doc = ev.doc;

        cache.emit( 'deleted', doc );

        onComplete( null, doc );
      });

    this.db.remove( id, rev, onComplete );

    function onComplete( err, doc ) {
      if ( !done ) {
        done = true;
        return cb && cb( err, doc );
      }
    }
  };

  Wrapper.prototype.get = function( id, cb ) {
    var cache = this;
    var cached = cache.docs[ id ];

    if ( cached ) {
      return cb && cb( null, cached );
    }

    cache.db.get( id, function( err, resource ) {
      cache.docs[ resource._id ] = resource;

      return cb && cb( err, resource );
    });
  };

  Wrapper.prototype.query = function( query, options, cb ) {
    this.db.query( query, options, function( err, resources ) {
        return cb && cb( err, resources );
    });
  };

  Wrapper.prototype.allDocs = function( query, cb ) {
    this.db.allDocs( query, function( err, resources ) {
        return cb && cb( err, resources );
    });
  };

function watchForChanges( changes, cache ) {
  changes
    .on('create', function( ev ) {
      var doc = ev.doc;

      cache.docs[ doc._id ] = doc;

      cache.emit( 'created', doc );
    })
    .on('update', function( ev ) {
      var doc = ev.doc;

      cache.docs[ doc._id ] = doc;

      cache.emit( 'updated', doc );
    });
}

module.exports = Wrapper;
