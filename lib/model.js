
/*
  TODO: if model had access to the shema it could store optimised views for quickly finding related documents

  view key could be [ PROPERTY_NAME, RELATED_DOC_ID, DOC_ID ]
*/

function Model( db, name ) {
    this._db = new Wrapper( db );
    this._name = name;
}

Model.prototype = {

    constructor: Model

  , post: function( data, cb /* error, resource */ ) {
        var model = this;

        data.doctype = this._name;

        model._db.post( data, function( err, info ) {
            if ( err ) return handleError( err, cb );

            return cb && cb( undefined, info );
        });
    }

  , postMany: function( updates, cb ) {
        this.putMany( updates, cb );
    }

  , put: function( update, id, cb /* error */ ) {
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
    }

  , putMany: function( updates, cb ) {
      var model = this;

      updates.forEach(function( update ) {
          update.doctype = model._name;
      });

      model._db.bulkDocs( updates, onComplete);

      function onComplete( err, info ) {
        if ( err ) return handleError( err, cb );

        return cb && cb( undefined, info );
      }
    }

  , remove: function( id, rev, cb /* error */ ) {
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
    }

  , get: function( id, cb /* error, resource */ ) {
      var model = this;

      model._db.get( id, onComplete);

      function onComplete( err, resource ) {
        if ( err ) return handleError( err, cb );

        return cb && cb( undefined, resource );
      }
    }

  , query: function( filter, cb /* error, resource */ ) {
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
    }

  , firstDoc: function( query, cb /* error, resource */ ) {
      var model = this;

      model.allDocs( query, onComplete );

      function onComplete( err, response ) {
        if ( err ) return handleError( err, cb );

        if ( response.length ) {
          return cb && cb( undefined, response[0] );
        }
      }
    }

  , allDocs: function( query, cb /* error, resources */ ) {
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

        if ( rows && rows.length === 0 ) return cb( undefined, results );

        for ( var i = 0, len = rows.length; i < len; i++ ) {
          var doc = rows[i].doc;

          if ( _docMatchesQuery( model, doc, query ) ) {
            result.push( doc );
          }
        }

        return cb && cb( undefined, result );
      }
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

module.exports = Model;

function Wrapper( db ) {
  this.db = db;

  this._docs = {};
}

Wrapper.prototype = {

  post: function( data, cb ) {
    this.db.post( data, function( err, info ) {
        return cb && cb( err, info );
    });
  },

  put: function( data, id, rev, cb ) {
    this.db.put( data, id, rev, function( err, info ) {
        return cb && cb( err, info );
    });
  },

  bulkDocs: function( updates, cb ) {
    this.db.bulkDocs( updates, function( err, info ) {
        return cb && cb( err, info );
    });
  },

  remove: function( id, rev, cb ) {
    this.db.remove( id, rev, function( err, info ) {
        return cb && cb( err, info );
    });
  },

  get: function( id, cb ) {
    this.db.get( id, function( err, info ) {
        return cb && cb( err, info );
    });
  },

  query: function( mapQuery, options, cb ) {
    this.db.query( mapQuery, options, function( err, info ) {
        return cb && cb( err, info );
    });
  },

  allDocs: function( query, cb ) {
    this.db.allDocs( query, function( err, info ) {
        return cb && cb( err, info );
    });
  }

};
