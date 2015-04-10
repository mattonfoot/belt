var util = require("util")
  , events = require("events");


function Wrapper( db ) {
  var cache = this;
  this.db = db;

  this.docs = {};

  // prime cache
  this.db.allDocs({ include_docs: true }, function( err, resources ) {
    resources.rows.forEach(function( resource ) {
      cache.docs[ resource._id ] = resource.doc;

      console.log( 'cache.prime', resource.doc._id, resource.doc._rev );
    });
  });

  events.EventEmitter.call( this );
}

util.inherits( Wrapper, events.EventEmitter );

Wrapper.prototype.constructor = Wrapper;

Wrapper.prototype.post = function( data, cb ) {
  var cache = this;

  cache.db.post( data, onComplete );

  cache.docs[ data._id ] = data;

  console.log( 'cache.post', data._id, data._rev );

  cache.emit( 'created', data );

  return cb && cb( undefined, data );

  function onComplete( err, info ) {
    if (err) return cb && cb( err, info );

    cache.docs[ info.id ]._rev = info.rev;

    console.log( 'cache.post.onComplete', info.id, info.rev );
  }
};

Wrapper.prototype.put = function( data, id, rev, cb ) {
  var cache = this;

  cache.db.put( data, id, rev, onComplete );

  delete data._rev;
  cache.docs[ data._id ] = data;

  console.log( 'cache.put', data, rev );

  cache.emit( 'updated', data );

  return cb && cb( undefined, data );

  function onComplete( err, info ) {
    if (err) return cb && cb( err, data );

    cache.docs[ info.id ]._rev = info.rev;

    console.log( 'cache.put.onComplete', cache.docs[ info.id ], info.rev );
  }
};

Wrapper.prototype.bulkDocs = function( updates, cb ) {
  var cache = this;

  this.db.bulkDocs( updates, onComplete );

  updates.forEach(function( update ) {
    delete update._rev;

    cache.docs[ update._id ] = update;

    console.log( 'cache.bulkDocs', update._id, update._rev );

    cache.emit( 'updated', update );
  });

  return cb && cb( undefined, updates );

  function onComplete( err, info ) {
    if ( err ) return cb && cb( err, info );

    info.forEach(function( update ) {
      cache.docs[ update.id ]._rev = update.rev;

      console.log( 'cache.bulkDocs.onComplete', update.id, update.rev );
    });
  }
};

Wrapper.prototype.remove = function( id, rev, cb ) {
  var cache = this;
  var doc = cache.docs[ id ];

  if ( !doc ) {
    return cb && cb( new Error( 'document with _id "' + id + '" is missing' ) );
  }

  delete cache.docs[ id ];

  cache.db.remove( id, rev, onComplete );

  cache.emit( 'deleted', doc );

  return cb && cb( undefined, doc );

  function onComplete( err, info ) {
    if (err) return cb && cb( err, info );

    if ( cache.docs[ id ] ) {
      delete cache.docs[ id ];
    }

    console.log( 'cache.remove.onComplete', id, rev );
  }
};

Wrapper.prototype.get = function( id, cb ) {
  var cache = this;
  var cached = cache.docs[ id ];

  if ( cached && cached._rev ) {
    console.log( 'cache.get', cached._id, cached._rev );

    return cb && cb( null, cached );
  }

  cache.db.get( id, onComplete );

  function onComplete( err, resource ) {
    if ( err ) return cb && cb( err, resource );

    cache.docs[ resource._id ] = resource;

    console.log( 'cache.get.onComplete', resource._id, resource._rev );

    return cb && cb( err, resource );
  }
};

Wrapper.prototype.query = function( query, options, cb ) {
  var cache = this;

  this.db.query( query, options, function( err, resources ) {
    if ( err ) return cb && cb( err, resource );

    resources.rows.forEach(function( resource ) {
      cache.docs[ resource.doc._id ] = resource.doc;

      console.log( 'cache.query.onComplete', resource.doc._id, resource.doc._rev );
    });

    return cb && cb( err, resources );
  });
};

Wrapper.prototype.allDocs = function( query, cb ) {
  var cache = this;

  this.db.allDocs( query, function( err, resources ) {
    if ( err ) return cb && cb( err, resource );

    resources.rows.forEach(function( resource ) {
      cache.docs[ resource.doc._id ] = resource.doc;

      console.log( 'cache.allDocs.onComplete', resource.doc._id, resource.doc._rev );
    });

    return cb && cb( err, resources );
  });
};

module.exports = Wrapper;
