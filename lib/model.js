
/*
  TODO: if model had access to the shema it could store optimised views for quickly finding related documents

  view key could be [ PROPERTY_NAME, RELATED_DOC_ID, DOC_ID ]
*/

function _docMatchesQuery( doc, query ) {
    for (var key in query) {
        if (!doc.hasOwnProperty( key ) || doc[ key ] !== query[ key ]) return false;
    }

    return true;
}

function handleError( err, cb ) {
  cb( new Error( err.message || err || 'An unknown error from the DB was caught, but no information was provided' ) );
}


function Model( db, name ) {
    this._db = db;
    this._name = name;
}

Model.prototype = {

    constructor: Model

  , post: function( data, cb /* error, resource */ ) {
        var model = this;

        data.doctype = this._name;

        model._db.post( data, function( err, info ) {
            if ( err ) return handleError( err, cb );

            cb( undefined, info );
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

            cb( undefined, info );
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

            cb( undefined, info );
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

            cb( undefined, info );
        }
    }

  , get: function( id, cb /* error, resource */ ) {
        var model = this;

        model._db.get( id, onComplete);

        function onComplete( err, resource ) {
            if ( err ) return handleError( err, cb );

            cb( undefined, resource );
        }
    }

  , query: function( mapObj, options, cb /* error, resource */ ) {
        if ( typeof options === 'function' ) {
          cb = options;
          options = {};
        }

        var model = this;

        options.include_docs = true;

        var mapQuery = {
            map: function( doc, emit ) {
                if ( doc.doctype === model._name ) {
                    mapObj.map( doc, emit );
                }
            }
        };

        model._db.query( mapQuery, { include_docs: true }, onComplete );

        function onComplete( err, response ) {
            if ( err ) return handleError( err, cb );

            if ( response.total_rows === 0 ) {
                return cb( undefined, [] );
            }

            cb( undefined, response.rows.map(function( row ) { return row.doc; }) );
        }
    }

  , firstDoc: function( query, cb /* error, resource */ ) {
        var model = this;

        model.allDocs( query, onComplete);

        function onComplete( err, response ) {
            if ( err ) return handleError( err, cb );

            if ( response.length ) {
                cb( undefined, response[0] );
            }
        }
    }

  , allDocs: function( query, cb /* error, resources */ ) {
        var model = this;

        if ( Array.isArray(query.keys) ) {
            model._db
                .allDocs({ keys: query.keys, include_docs: true }, function( err, response ) {
                    if ( err ) return handleError( err, info );

                    onComplete( err, response );
                });

            return;
        }

        var map = {
            map: function( doc, emit ) {
                if ( doc.doctype === model._name && _docMatchesQuery( doc, query ) ) {
                    emit();
                }
            }
        };

        model.query( map, onComplete );

        function onComplete( err, response ) {
            if ( err ) return handleError( err, info );

            if ( Array.isArray(response) ) return cb( undefined, response );

            if ( response.total_rows === 0 ) return cb( undefined, [] );

            cb( undefined, response.rows.map(function( row ) { return row.doc; }) );
        }
    }

};

module.exports = Model;
