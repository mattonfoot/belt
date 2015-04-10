var util = require('util')
  , events = require('events')
  , jsonpatch = require('fast-json-patch')
  , uuid = require('uuid');

function Model( db, name ) {
  this._db = db;
  this._name = name;

  watchForChanges( this );

  events.EventEmitter.call( this );
}

util.inherits( Model, events.EventEmitter );

Model.prototype.constructor = Model;

Model.prototype.post = function( data, cb /* error, resource */ ) {
  var model = this;

  data._id = uuid.v4();
  data.doctype = this._name;

  model._db.post( data, onComplete );

  return cb && cb( undefined, data );

  function onComplete( err, info ) {
    if ( err ) return handleError( err, cb );
  }
};

Model.prototype.postMany = function( updates, cb /* error, resources */ ) {
    this.putMany( updates, cb );
};

Model.prototype.put = function( update, id, cb /* error, resource */ ) {
  var model = this;

  if ( typeof id === 'function' ) {
    cb = id;
    id = update.id;
  }

  update.doctype = model._name;

  model._db.get( id, function( err, resource ) {
    if ( err ) return handleError( err, cb );

    model._db.put( update, id, resource._rev, onComplete);

    update._id = id;

    return cb && cb( undefined, update );
  });

  function onComplete( err, info ) {
    if ( err ) return handleError( err, cb );
  }
};

Model.prototype.patch = function( query, patch, cb /* error, resource */ ) {
  var model = this;

  if ( !Array.isArray( patch ) ) patch = [ patch ];

  var validationErrors = jsonpatch.validate( patch );
  if ( validationErrors ) return handleError( validationError, cb );

  model.allDocs( query, function( err, resources ) {
    if ( err ) return handleError( err, cb );

    if ( !resources.length ) return cb && cb( undefined, [] );

    var updates = resources.map(function( doc ) {
      if ( !jsonpatch.apply( doc, patch ) ) return handleError( new Error( 'Failed to apply patch' ), cb );

      return doc;
    });

    model._db.bulkDocs( updates, onComplete );

    return cb && cb( undefined, updates );
  });

  function onComplete( err, info ) {
    if ( err ) return handleError( err, cb );
  }
};

Model.prototype.putMany = function( updates, cb /* error, resources */ ) {
  var model = this;

  updates.forEach(function( update ) {
      update.doctype = model._name;
  });

  model._db.bulkDocs( updates, onComplete );

  function onComplete( err, info ) {
    if ( err ) return handleError( err, cb );

    return cb && cb( undefined, updates );
  }
};

Model.prototype.remove = function( id, cb /* error, resource */ ) {
  var model = this;

  locateAndDelete();

  function locateAndDelete() {
    model._db.get( id, function ( error, resource ) {
      if ( error ) return handleError( error, cb );

      if ( !resource._rev ) {
        setTimeout(function() {
          locateAndDelete();
        }, 0);

        return;
      }

      model._db.remove( id, resource._rev, function( err, info ) {
        if ( err ) return handleError( err, cb );
      });

      return cb && cb( undefined, resource );
    });
  }
};

Model.prototype.get = function( id, cb /* error, resource */ ) {
  var model = this;

  model._db.get( id, onComplete);

  function onComplete( err, resource ) {
    if ( err ) return handleError( err, cb );

    return cb && cb( undefined, resource );
  }
};

Model.prototype.query = function( filter, cb /* error, resource */ ) {
  var model = this;

  var options = { reduce: false, include_docs: true };

  var mapQuery = {
    map: function( doc, emit ) {
      if ( _docMatchesQuery( model, doc, filter ) ) {
        emit( doc._id, doc );
      }
    }
  };

  model._db.query( mapQuery, options, onComplete );

  // model._db.allDocs( options, onComplete );

  function onComplete( err, response ) {
    if ( err ) return handleError( err, cb );

    if ( Array.isArray(response) ) return cb( undefined, response );

    var results = [];
    var rows = response.rows;

    if ( rows && rows.length === 0 ) return cb( undefined, results );

    for ( var i = 0, len = rows.length; i < len; i++ ) {
      var doc = rows[i].doc;

      if ( _docMatchesQuery( model, doc, filter ) ) {
        results.push( doc );
      }
    }

    return cb && cb( undefined, results );
  }
};

Model.prototype.firstDoc = function( query, cb /* error, resource */ ) {
  var model = this;

  model.allDocs( query, onComplete );

  function onComplete( err, response ) {
    if ( err ) return handleError( err, cb );

    if ( response.length ) {
      return cb && cb( undefined, response[0] );
    }
  }
};

Model.prototype.allDocs = function( query, cb /* error, resources */ ) {
  var model = this;
  var options = { include_docs: true };

  if ( query.keys && !Array.isArray( query.keys ) ) {
    query.keys = [ query.keys ];
  }

  options.keys = query.keys;

  if ( Array.isArray( query ) ) {
    options.keys = query;
  }

  query.doctype = model._name;

  model._db.allDocs( options, onComplete );

  function onComplete( err, response ) {
    if ( err ) return handleError( err, cb );

    if ( Array.isArray(response) ) return cb( undefined, response );

    var result = [];
    var rows = response.rows;

    if ( rows && rows.length === 0 ) return cb( undefined, result );

    for ( var i = 0, len = rows.length; i < len; i++ ) {
      var doc = rows[i].doc;

      if ( _docMatchesQuery( model, doc, query ) ) {
        result.push( doc );
      }
    }

    return cb && cb( undefined, result );
  }
};

function _docMatchesQuery( model, doc, query ) {
  if ( typeof query === 'function' ) return query( doc );

  for ( var key in query ) {
    if ( key === 'keys' ) continue;

    if ( !doc.hasOwnProperty( key ) || doc[ key ] !== query[ key ] ) return false;
  }

  return true;
}

function handleError( err, cb ) {
  return cb && cb( new Error( err.message || err || 'An unknown error from the DB was caught, but no information was provided' ) );
}

function watchForChanges( model ) {
  model._db
    .on('create', function( doc ) {
      model.emit( 'created', doc );
    })
    .on('update', function( doc ) {
      model.emit( 'updated', doc );
    })
    .on('delete', function( doc ) {
      model.emit( 'deleted', doc );
    });
}

module.exports = Model;
