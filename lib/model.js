
function _docMatchesQuery( doc, query ) {
    for (var key in query) {
        if (!doc.hasOwnProperty( key )
              || !doc[ key ] !== query[ key ]) return false;
    }

    return true;
}

function Model( db, name, schema ) {
    this._db = db;
    this._name = name;
}

Model.prototype = {

    constructor: Model

  , post: function( data, cb /* error, resource */ ) {
        var model = this;

        data.doctype = this._name;

        model._db
            .post( data, function( err, info ) {
                if ( err && err.message ) {
                    return cb( new Error( err.message ) );
                }

                cb( undefined, info );
            });
    }

  , put: function( update, id, cb /* error */ ) {
        if ( typeof id === 'function' ) {
            cb = id;
            id = update.id;
        }

        var model = this;

        update.doctype = model._name;

        model.get( id, function( err, resource ) {
            if ( err ) return cb( err );

            model._db
                .put( update, resource._id, resource._rev, function( err, info ) {
                    if ( err && err.message ) {
                        return cb( new Error( err.message ) );
                    }

                    cb( undefined, info );
                });
        });

    }

  , putMany: function( updates, cb ) {
        var model = this;

        updates.forEach(function( update ) {
            update.doctype = model._name;
        });

        model._db
            .bulkDocs( updates, function( err, info ) {
                if ( err && err.message ) {
                    return cb( new Error( err.message ) );
                }

                cb( undefined, info );
            });
    }

  , remove: function( id, rev, cb /* error */ ) {
        if ( typeof rev === 'function' ) {
          cb = rev;
          rev = id._rev;
          id = id._id;
        }

        var model = this;

        model._db
            .remove( id, rev, function( err, info ) {
                if ( err && err.message ) {
                    return cb( new Error( err.message ) );
                }

                cb( undefined, info );
            });
    }

  , get: function( id, cb /* error, resource */ ) {
        var model = this;

        model._db
            .get( id, function( err, resource ) {
                if ( err && err.message ) {
                    return cb( new Error( err.message ) );
                }

                cb( undefined, resource );
            });
    }

  , query: function( mapObj, options, cb /* error, resource */ ) {
        if ( typeof options === 'function' ) {
          cb = options;
          options = {};
        }

        var model = this
          , onComplete = function( err, response ) {
                if ( err && err.message ) {
                    return cb( new Error( err.message ) );
                }

                if ( response.total_rows === 0 ) {
                    return cb( undefined, [] );
                }

                cb( undefined, response.rows.map(function( row ) { return row.doc; }) );
            };

        options.include_docs = true;

        var mapQuery = {
            map: function( doc, emit ) {
                if ( doc.doctype === model._name ) {
                    mapObj.map( doc, emit );
                }
            }
        };

        model._db
            .query( mapQuery, { include_docs: true }, onComplete );
    }

  , firstDoc: function( query, cb /* error, resource */ ) {
        var model = this;

        model.allDocs( query, function( err, response ) {
            if ( err ) return cb( err );

            if ( response.length ) {
                cb( undefined, response[0] );
            }
        });
    }

  , allDocs: function( query, cb /* error, resources */ ) {
        var model = this
          , onComplete = function( err, response ) {
                if ( err ) return cb( err );

                if ( Array.isArray(response) ) return cb( undefined, response );

                if ( response.total_rows === 0 ) return cb( undefined, [] );

                cb( undefined, response.rows.map(function( row ) { return row.doc; }) );
            };

        if ( Array.isArray(query.keys) ) {
            model._db
                .allDocs({ keys: query.keys, include_docs: true }, function( err, response ) {
                    if ( err && err.message ) {
                        return cb( new Error( err.message ) );
                    }

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
    }

};

module.exports = Model;
