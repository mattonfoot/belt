var util = require('util')
  , events = require('events')
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

  model._db.post( data, onCreate );

  function onCreate( err, info ) {
    if ( err ) return handleError( err, cb );

    model.get( info.id, onComplete );
  }

  function onComplete( err, resource ) {
    if ( err ) return handleError( err, cb );

    return cb && cb( undefined, resource );
  }
};

Model.prototype.put = function( update, id, cb /* error, resource */ ) {
  var model = this;

  if ( typeof id === 'function' ) {
    cb = id;
    id = update.id;
  }

  update.doctype = model._name;

  model.get( id, onFind );

  function onFind( err, resource ) {
    if ( err ) return handleError( err, cb );

    model._db.put( update, id, resource._rev, onUpdate );
  }

  function onUpdate( err, info ) {
    if ( err ) return handleError( err, cb );

    model.get( info.id, onComplete );
  }

  function onComplete( err, resource ) {
    if ( err ) return handleError( err, cb );

    return cb && cb( undefined, resource );
  }
};

Model.prototype.patchMany = function( query, patch, cb /* error, resource */ ) {
  var model = this;

  model.allDocs( query, onFind );

  function onFind( err, resources ) {
    if ( err ) return handleError( err, cb );

    if ( !resources.length ) return cb && cb( undefined, [] );

    var updates = resources.map(function( resource ) {
      try {
        var doc = patch( resource );

        return doc;
      }
      catch( e ) {
        console.error( e );

        handleError( new Error( 'Failed to patch document ' + resource._id ), cb );
      }
    });

    model.putMany( updates, onComplete );
  }

  function onComplete( err, resources ) {
    if ( err ) return handleError( err, cb );

    return cb && cb( undefined, resources );
  }
};

Model.prototype.putMany = function( updates, cb /* error, resources */ ) {
  var model = this;

  var query = { keys: updates.map(function( update ) { return update._id; }) };

  model.allDocs( query, onFind );

  function onFind( err, resources ) {
    if ( err ) return handleError( err, cb );

    if ( !resources.length ) return cb && cb( undefined, [] );

    updates = updates.map(function( update ) {
      var rev, doctype;

      resources.forEach(function( resource ) {
        if ( resource._id == update._id ) {
          rev = resource._rev;
          doctype = resource.doctype;

          return false;
        }
      });

      update._rev = rev;
      update.doctype = doctype;

      return update;
    });

    model._db.bulkDocs( updates, onUpdate );
  }

  function onUpdate( err, info ) {
    if ( err ) return handleError( err, cb );

    model.allDocs( query, onComplete );
  }

  function onComplete( err, resources ) {
    if ( err ) return handleError( err, cb );

    return cb && cb( undefined, resources );
  }
};

Model.prototype.remove = function( id, cb /* error, resource */ ) {
  var model = this;

  model.get( id, function ( error, resource ) {
    if ( error ) return handleError( error, cb );

    model._db.remove( id, resource._rev, onComplete );

    function onComplete( err, info ) {
      if ( err ) return handleError( err, cb );

      return cb && cb( undefined, resource );
    }
  });
};

Model.prototype.get = function( id, cb /* error, resource */ ) {
  var model = this;

  model._db.get( id, onComplete );

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

  if ( query.keys ) {
    if ( Array.isArray( query.keys ) ) {
      options.keys = query.keys;
    } else {
      query.key = query.keys;
      delete query.keys;
    }
  }

  if ( query.key ) {
    options.key = query.key;
  }

  if ( Array.isArray( query ) ) {
    options.keys = query;
  }

  if ( typeof query === 'string' ) {
    options.key = query;
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
    if ( key === 'keys' || key === 'key' ) continue;

    if ( !doc.hasOwnProperty( key ) ) {
      return false;
    }

    if ( !Array.isArray( doc[ key ] ) ) {
      if ( !Array.isArray( query[ key ] ) ) {
        if ( doc[ key ] !== query[ key ] ) {
          return false;
        }
      } else {
        if ( !~query[ key ].indexOf( doc[ key ] ) ) {
          return false;
        }
      }
    } else {
      if ( !~doc[ key ].indexOf( query[ key ] ) ) {
        return false;
      }
    }
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
