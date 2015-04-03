var util = require("util")
  , events = require("events")
  , Wrapper = require('./cache');

/*
  TODO: if model had access to the shema it could store optimised views for quickly finding related documents

  view key could be [ PROPERTY_NAME, RELATED_DOC_ID, DOC_ID ]
*/

function Model( db, name ) {
  this._db = new Wrapper( db );
  this._name = name;

  watchForChanges( this );

  events.EventEmitter.call( this );
}

util.inherits( Model, events.EventEmitter );

Model.prototype.constructor = Model;

Model.prototype.post = function( data, cb /* error, resource */ ) {
    var model = this;

    data.doctype = this._name;

    model._db.post( data, function( err, info ) {
        if ( err ) return handleError( err, cb );

        return cb && cb( undefined, info );
    });
};

Model.prototype.postMany = function( updates, cb ) {
    this.putMany( updates, cb );
};

Model.prototype.put = function( update, id, cb /* error */ ) {
    if ( typeof id === 'function' ) {
        cb = id;
        id = update.id;
    }

    var model = this;

    update.doctype = model._name;

    model._db.put( update, id, update._rev, onComplete);

    function onComplete( err, info ) {
        if ( err ) return handleError( err, cb );

        return cb && cb( undefined, info );
    }
};

Model.prototype.putMany = function( updates, cb ) {
  var model = this;

  updates.forEach(function( update ) {
      update.doctype = model._name;
  });

  model._db.bulkDocs( updates, onComplete);

  function onComplete( err, info ) {
    if ( err ) return handleError( err, cb );

    return cb && cb( undefined, info );
  }
};

Model.prototype.remove = function( id, rev, cb /* error */ ) {
  if ( typeof rev === 'function' ) {
    cb = rev;
    rev = id._rev;
    id = id._id;
  }

  var model = this;

  model._db.remove( id, rev, onComplete);

  function onComplete( err, info ) {
    if ( err ) return handleError( err, cb );

    return cb && cb( undefined, info );
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

  if ( Array.isArray(query.keys) ) {
    options.keys = query.keys;
  }

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
  if ( doc.doctype === model._name ) {
    if ( typeof query === 'function' ) return query( doc );

    for ( var key in query ) {
      if ( key === 'keys' ) continue;

      if ( !doc.hasOwnProperty( key ) || doc[ key ] !== query[ key ] ) return false;
    }

    return true;
  }
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
