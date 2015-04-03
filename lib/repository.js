var util = require("util")
  , events = require("events")
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Model = require('./model');

// Repository
// Follows the interface for the fortuneJS library adapters in an attempt to provide additional db options easily

function Repository( db, options ) {
  this.db = db;

  events.EventEmitter.call( this );
}

util.inherits( Repository, events.EventEmitter );

Repository.prototype.constructor = Repository;

Repository.prototype._models = {};
Repository.prototype._schemas = {};

Repository.prototype.schema = function( name, schema, alsoCreateModel ) {
    for( var key in schema ) {
        var value = schema[ key ]
          , obj = {}
          , isArray = Array.isArray( value );

        value = isArray ? value[0] : value;

        var isObject = _isObject( value )
          , ref = isObject ? value.ref : value
          , inverse = isObject ? value.inverse : undefined;

        // Convert string to association object
        if ( typeof ref === 'string' ) {
            obj.ref = ref;
            obj.inverse = inverse;
            schema[ key ] = isArray ? [ obj ] : obj;
        }

        // Wrap native type in object
        if ( typeof value === 'function' ) {
            schema[ key ] = isArray ? [{ type: schema[ key ] }] : { type: schema[ key ] };
        }

    }

    this._schemas[ name ] = schema;

    if (alsoCreateModel) this.model( name, schema );

    return schema;
};

Repository.prototype.model = function( name, schema ) {
    var model;

    if ( schema ) {
        model = new Model( this.db, name );

        watchForChanges( model, this );

        this._models[ name ] = model;
    } else {
        model = this._models[ name ];

        if (!model) throw new Error( 'Schema ['+name+'] not registered.' );
    }

    return model;
};

// TODO: array of updates should invoke postMany

Repository.prototype.create = function( model, id, resource ) {
    var _this = this;

    if (!resource) {
      resource = id;
    } else {
      resource.id = id;
    }

    model = typeof model === 'string' ? this.model( model ) : model;
    resource = _serialize.call( _this, model, resource );

    return new Promise(function ( resolve, reject ) {
      model.post( resource, function ( error, info ) {
        if (error) return reject(error);

        resource._id = info.id;
        resource._rev = info.rev;

        _handleWrite.call( _this, model, resource, error, resolve, reject );
      });
    });
};

// TODO: array of updates should invoke putMany

Repository.prototype.update = function( model, id, update ) {
    var _this = this;

    if (!update) {
        update = id;
    } else {
        update.id = id;
    }

    id = update.id;

    model = typeof model === 'string' ? this.model( model ) : model;
    update = _serialize.call( _this, model, update);

    return new Promise(function (resolve, reject) {
        // have to do a get to find the latest revision
        model.get( id, function( err, resource ) {
            if ( err ) return reject( err );

            update._id = id;
            update._rev = resource._rev;

            model.put( update, function (error, info) {
              if (error) return reject(error);

              update._rev = info.rev;

              _handleWrite.call( _this, model, update, error, resolve, reject );
            });
        });
    });
};

// TODO: array of ids should invoke removeMany

Repository.prototype.delete = function( model, id ) {
    var _this = this;

    model = typeof model === 'string' ? this.model(model) : model;

    return new Promise(function ( resolve, reject ) {
        model.get(id, function ( error, resource ) {
            if (error || !resource) return reject(error);

            resource = _dissociate.call( _this, model, resource );

            model.remove( resource, function ( error ) {
              _handleWrite.call( _this, model, resource, error, resolve, reject );
            });
        });
    });
};

Repository.prototype.find = function( model, query ) {
    var _this = this
      , method = typeof query != 'object' ? 'get' : 'firstDoc';

    model = typeof model == 'string' ? this.model(model) : model;

    return new Promise(function (resolve, reject) {
        model[method](query, function (error, resource) {
          if (error || !resource) return reject(error);

          resolve( _deserialize.call( _this, model, resource) );
        });
    });
};

Repository.prototype.findMany = function( model, query ) {
    var _this = this;

    if ( Array.isArray(query) ) {
        query = query.length ? { keys: query } : {};
    } else if (!query) {
        query = {};
    }

    model = typeof model === 'string' ? this.model(model) : model;

    return new RSVP.Promise(function (resolve, reject) {
        model.allDocs( query, function (error, resources) {
            if (error) return reject(error);

            resources = resources.map(function (resource) {
                return _deserialize.call( _this, model, resource);
            });

            resolve(resources);
        });
    });
};


// private methods

function _handleWrite( model, resource, error, resolve, reject ) {
    var _this = this;

    if (error || !resource) return reject(error);

    _updateRelationships
        .call( this, model, resource)
        .then(function (resource) {
            resolve( _deserialize.call( _this, model, resource ) );
        }, reject);
}

function _serialize( model, resource ) {
    var doc = {};

    for ( var key in resource ) {
        if ( !resource.hasOwnProperty( key ) ) continue;

        if ( ~[ 'id', '_id', 'rev', '_rev', 'doctype', 'links' ].indexOf( key ) ) continue;

        doc[ key ] = resource[ key ];
    }

    // flatten links
    if ( resource.hasOwnProperty( 'links' ) && typeof resource.links === 'object' ) {
        for ( var link in resource.links ) {
            doc[ link ] = resource.links[ link ];
        }
    }

    return _scrubResource.call( this, model, doc );
}

function _deserialize( model, resource ) {
    var json = {}
      , schema = this._schemas[ model._name ];

    json.id = resource._id;
    json.rev = resource._rev;

    var relations = [];
    for ( var key in schema ) {
        if (key === '_id') continue;

        var value = schema[key]
          , type = value.type
          , typeString = type ? typeCheck(type) : ''
          , ref = Array.isArray(value) ? value[0].ref : value.ref;

        json[key] = resource[key];

        if ( type && !ref ) {
          json[key] = type( resource[key] );

          if ( typeString === 'date' ) {
            json[key] = new Date( resource[key] );
          } else if ( typeString === 'array' || typeString === 'object' ) {
            json[key] = typeof resource[key] === 'object' ? resource[key] : null;
          }
        }

        if ( ref ) {
            relations.push(key);
        }
    }

    if (relations.length) {
        var links = {}
          , linksAdded = false;

        relations.forEach(function (relation) {
            if ( Array.isArray(json[relation]) ? json[relation].length : json[relation] ) {
                links[relation] = json[relation];
                linksAdded = true;
            }

            delete json[relation];
        });

        if ( linksAdded ) {
            json.links = links;
        }
    }

    return json;
}

function _scrubResource( model, resource ) {
    var json = {};

    var schema = this._schemas[ model._name ];

    for (var key in schema ) {
        if (!resource.hasOwnProperty(key)) continue;

        var value = schema[key]
          , type = value.type
          , typeString = type ? typeCheck(type) : ''
          , ref = Array.isArray(value) ? value[0].ref : value.ref;

        if (type && !ref) {
            json[key] = type(resource[key]);

            if (typeString === 'date') {
                json[key] = new Date(resource[key]);
            } else if (typeString === 'array' || typeString === 'object') {
                json[key] = typeof resource[key] === 'object' ? resource[key] : null;
            }
        } else if (ref) {
            json[key] = resource[key];
        }
    }

    return json;
}

function typeCheck (fn) {
    return Object.prototype.toString.call(new fn(''))
        .slice(1, -1).split(' ')[1].toLowerCase();
}

function _updateRelationships( model, resource ) {
    var _this = this
      , schema = this._schemas[ model._name ]
      , references = _getSchemaFields( schema, function( obj, schema ) { return ( typeof obj === 'object' && obj.hasOwnProperty('ref') ); })
      , promises = [];

    references
        .forEach(function( reference ) {
            if (reference.inverse !== undefined && !reference.inverse) {
                return;
            }

            var relatedModel = _this._models[ reference.model ]
              , relatedSchema = _this._schemas[ reference.model ];

            // Get fields on the related model that reference this model
            if (typeof reference.inverse === 'string') {
                var inverted = {};

                inverted[ reference.inverse ] = relatedSchema[ reference.inverse ];
                relatedSchema = inverted;
            }

            var fields = _getSchemaFields( relatedSchema, function( obj, schema ) { return (typeof obj === 'object' && obj.ref === model._name ); });

            fields
                .forEach(function( field ) {
                    // One-to-one
                    if ( reference.singular && field.singular ) {
                        return promises.push( _updateOneToOne.call( _this, relatedModel, resource, reference, field ) );
                    }
                    // One-to-many
                    if ( reference.singular && !field.singular ) {
                        return promises.push( _updateOneToMany.call( _this, relatedModel, resource, reference, field ) );
                    }
                    // Many-to-one
                    if ( !reference.singular && field.singular ) {
                        return promises.push( _updateManyToOne.call( _this, relatedModel, resource, reference, field ) );
                    }
                    // Many-to-many
                    if ( !reference.singular && !field.singular ) {
                        return promises.push( _updateManyToMany.call( _this, relatedModel, resource, reference, field ) );
                    }
                });
        });

    return new Promise(function (resolve, reject) {
        RSVP.all(promises)
            .then(function () {
                resolve( resource );
            }, function ( errors ) {
                reject( errors );
            });
    });
}

function _getSchemaFields( schema, isValid ) {
    var fields = [];

    for (var key in schema ) {
        var value = schema[ key ]
          , singular = !Array.isArray( value )
          , obj = singular ? value : value[0];

        if ( isValid( obj ) ) {
            fields.push({
                path: key,
                model: obj.ref,
                singular: singular,
                inverse: obj.inverse
            });
          }
    }

    return fields;
}



function _updateOneToOne( relatedModel, resource, reference, field ) {
  var _this = this;

  function dissociate( doc ) {
    return ( doc[ field.path ] === resource._id );
  }

  return new Promise(function (resolve, reject) {
    relatedModel.query( dissociate, function ( error, responses ) {
        if (error) return reject(error);

        if (!responses.length) return resolve( [] );

        resolve( _unsetSingleDocs.call( _this, responses, relatedModel, reference, field, resource ) );
    });
  })
  .then(function( updates ) {
    if ( !resource[ reference.path ] ) return updates;

    return new Promise(function (resolve, reject) {
        // have to do a get to find the latest revision
        relatedModel.get( resource[ reference.path ], function( error, response ) {
            if ( error ) return reject( error );

            var docs = updates.concat( _setSingleDoc.call( _this, response, relatedModel, reference, field, resource ) );

            resolve( docs );
        });
    });
  })
  .then(function( updates ) {
    return new Promise(function (resolve, reject) {
      relatedModel.putMany( updates, function( error, info ) {
        if ( error ) return reject( error );

        resolve();
      });
    });
  });
}


function _updateOneToMany( relatedModel, resource, reference, field ) {
  var _this = this;

  function dissociate( doc ) {
    return ( doc[ field.path ] !== undefined && ~doc[ field.path ].indexOf( resource._id ) );
  }

  return new Promise(function (resolve, reject) {
    relatedModel.query( dissociate, function ( error, responses ) {
        if (error) return reject(error);

        if (!responses.length) return resolve( [] );

        resolve( _removeFromManyDocs.call( _this, responses, relatedModel, reference, field, resource ) );
    });
  })
  .then(function( updates ) {
    if ( !resource[ reference.path ] ) return updates;

    return new Promise(function (resolve, reject) {
        // have to do a get to find the latest revision
        relatedModel.get( resource[ reference.path ], function( error, response ) {
            if ( error ) return reject( error );

            var docs = updates.concat( _addSingleDoc.call( _this, response, relatedModel, reference, field, resource ) );

            resolve( docs );
        });
    });
  })
  .then(function( updates ) {
    return new Promise(function (resolve, reject) {
      relatedModel.putMany( updates, function( error, info ) {
        if ( error ) return reject( error );

        resolve();
      });
    });
  });
}

function _updateManyToOne( relatedModel, resource, reference, field ) {
  var _this = this;

  function dissociate( doc ) {
    return ( doc[ field.path ] === resource._id );
  }

  return new Promise(function (resolve, reject) {
    relatedModel.query( dissociate, function ( error, responses ) {
      if ( error ) return reject( error );

      if (!responses.length) return resolve( [] );

      resolve( _unsetSingleDocs.call( _this, responses, relatedModel, reference, field, resource ) );
    });
  })
  .then(function( updates ) {
    if ( !resource[ reference.path ] ) return updates;

    return new Promise(function (resolve, reject) {
      relatedModel.allDocs({ keys: resource[ reference.path ] }, function ( error, responses ) {
        if ( error ) return reject( error );

        if (!responses.length) return resolve( updates );

        var docs = updates.concat( _applyToManyDocs.call( _this, _setSingleDoc, responses, relatedModel, reference, field, resource ) );

        resolve( docs );
      });
    });
  })
  .then(function( updates ) {
    return new Promise(function (resolve, reject) {
      relatedModel.putMany( updates, function( error, info ) {
        if ( error ) return reject( error );

        resolve();
      });
    });
  });
}

function _updateManyToMany( relatedModel, resource, reference, field ) {
  var _this = this;

  function dissociate( doc ) {
      if ( doc._id === resource._id || doc[ field.path ] === undefined ) return false;

      var docIsLinked = doc[ field.path ].indexOf( resource._id ) >= 0;
      var resourceIsNoLongerLinked = ( resource[ reference.path ] === undefined || resource[ reference.path ].indexOf( doc._id ) < 0 );

      return ( docIsLinked && resourceIsNoLongerLinked );
  }

  return new Promise(function (resolve, reject) {
    relatedModel.query( dissociate, function ( error, responses ) {
      if ( error ) return reject( error );

      if ( !responses.length ) return resolve( [] );

      var docs = _removeFromManyDocs.call( _this, responses, relatedModel, reference, field, resource );

      resolve( docs );
    });
  })
  .then(function( updates ) {
    if ( !resource[ reference.path ] ) return updates;

    return new Promise(function (resolve, reject) {
      relatedModel.allDocs({ keys: resource[ reference.path ] }, function ( error, responses ) {
          if ( error ) return reject( error );

          if (!responses.length) return resolve( updates );

          var docs = updates.concat( _applyToManyDocs.call( _this, _addSingleDoc, responses, relatedModel, reference, field, resource ) );

          resolve( docs );
      });
    });
  })
  .then(function( updates ) {
    return new Promise(function (resolve, reject) {
      relatedModel.putMany( updates, function( error, info ) {
        if ( error ) return reject( error );

        resolve();
      });
    });
  });
}




function _unsetSingleDocs( rows, relatedModel, reference, field, resource ) {
    return rows.map(function( doc ) {
        doc[ field.path ] = undefined;

        return doc;
    });
}

function _removeFromManyDocs( rows, relatedModel, reference, field, resource ) {
    return rows.map(function( doc ) {
      doc[ field.path ].splice( doc[ field.path ].indexOf( resource._id ), 1 );

      if ( doc[ field.path ].length <= 0 ) {
        doc[ field.path ] = undefined;
      }

      return doc;
    });
}

function _applyToManyDocs( fun, rows, relatedModel, reference, field, resource ) {
    return rows.map(function( doc ) {
        return fun( doc, relatedModel, reference, field, resource );
    });
}

function _setSingleDoc( doc, relatedModel, reference, field, resource ) {
    doc[ field.path ] = resource._id;

    return doc;
}

function _addSingleDoc( doc, relatedModel, reference, field, resource ) {
    doc[ field.path ] = doc[ field.path ] || [];

    if ( doc[ field.path ].indexOf( resource._id ) < 0 ) {
        doc[ field.path ].push( resource._id );
    }

    return doc;
}

function _dissociate( model, resource ) {
  var schema = this._schemas[model._name];
  for ( var key in schema ) {
      var value = schema[key];

      if ( Array.isArray(value) ? value[0].ref : value.ref ) {
          resource[key] = null;
      }
  }

  return resource;
}

// util methods

function _isObject( o ) {
    return typeof o === "object" && o.constructor === Object && o !== null;
}

function watchForChanges( model, repository ) {
  model
    .on('create', function( doc ) {
      repository.emit( 'created', doc );
    })
    .on('update', function( doc ) {
      repository.emit( 'updated', doc );
    })
    .on('delete', function( doc ) {
      repository.emit( 'deleted', doc );
    });
}

module.exports = Repository;
