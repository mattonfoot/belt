var util = require("util")
  , events = require("events")
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , PouchDB = require('pouchdb')
  , Repository = require('./repository');

// Adapter
//    .resource( 'card', ModelFactory.constructor )
//    .schema( ModelFactory.schema )
//    .validator( ModelFactory.validator )
//    .beforeCreate( onBeforeCreate )         // function returns data to succeed, returns falsey to fail
//    .beforeUpdate( onBeforeUpdate );        // function returns data to succeed, returns falsey to fail
//
//  Adapter.create( 'card', data ).then( done, fail );
//  Adapter.update( 'card', data ).then( done, fail );
//  Adapter.delete( 'card', id ).then( done, fail );
//  Adapter.find( 'card', id ).then( done, fail );
//  Adapter.findMany( 'card', query || [ id ] ).then( done, fail );
//  Adapter.findAll( 'card' ).then( done, fail );

// public interface

function Adapter( dbname, options ) {
    var dbtype = typeof dbname;

    if ( dbtype !== 'string' && dbtype !== 'object' ) {
        throw new Error( 'A Pouch DB instance or a database name must be provided' );
    }

    for (var key in options || {}) {
        if (!options.hasOwnProperty(key)) continue;

        this._options[key] = options[key];
    }

    var db = dbtype === 'string' ? new PouchDB( dbname ) : dbname;

    this.db = db;
    this._repository = new Repository( db );

    watchForChanges( this, {
        include_docs: true
      , since: 'now'
      , live: true
    });

    events.EventEmitter.call( this );
}

util.inherits( Adapter, events.EventEmitter );

Adapter.prototype.constructor = Adapter;

Adapter.prototype._options = {};

Adapter.prototype._factories = {};
Adapter.prototype._validators = {};
Adapter.prototype._beforeCreate = {};
Adapter.prototype._beforeUpdate = {};

Adapter.prototype.resource = function( schema, factory ) {
    if (!factory) {
        if (!this._context) throw new Error( 'No schema name defined in context' );

        factory = schema;
        schema = this._context;
    }

    this._factories[schema] = factory;

    this._context = schema;

    return this;
};

Adapter.prototype.schema = function( schema, definition ) {
    if (!definition) {
        if (!this._context) throw new Error( 'No schema name defined in context' );

        definition = schema;
        schema = this._context;
    }

    this._repository.schema( schema, definition, true );

    this._context = schema;

    return this;
};

Adapter.prototype.validator = function( schema, validator ) {
    if (!validator) {
        if (!this._context) throw new Error( 'No schema name defined in context' );

        validator = schema;
        schema = this._context;
    }

    this._validators[schema] = validator;

    this._context = schema;

    return this;
};

Adapter.prototype.beforeCreate = function( schema, transform ) {
    if (!transform) {
        if (!this._context) throw new Error( 'No schema name defined in context' );

        transform = schema;
        schema = this._context;
    }

    this._beforeCreate[schema] = this._beforeCreate[schema] || [];
    this._beforeCreate[schema].push(transform);

    this._context = schema;

    return this;
};

Adapter.prototype.beforeUpdate = function( schema, transform ) {
    if (!transform) {
        if (!this._context) throw new Error( 'No schema name defined in context' );

        transform = schema;
        schema = this._context;
    }

    this._beforeUpdate[schema] = this._beforeUpdate[schema] || [];
    this._beforeUpdate[schema].push(transform);

    this._context = schema;

    return this;
};

Adapter.prototype.create = function( schema, data ) {
    var _this = this
      , validator = _this._validators[schema]( data );

    return new Promise(function( resolve, reject ) {
        if ( !validator.validForCreate ) {
          var error = new Error( 'Schema validation failed: ' + validator.issues.join(', ') );

          _this.emit( schema + ':createfail', {
            id: data.id,
            err: error
          });

          throw error;
        }

        _this._repository
          .create( schema, _onBeforeTransforms( _this._beforeCreate[schema], data ) )
          .then( _this._factories[schema] )
          .then(function( doc ) {
            _this.emit( schema + ':created', doc );

            resolve( doc );
          })
          .catch(function( err ) {
            _this.emit( schema + ':createfail', {
              id: data._id,
              err: err
            });

            reject( err );
          });

    });
};

Adapter.prototype.update = function( schema, data ) {
    var _this = this
      , validator = _this._validators[schema]( data );

    return new Promise(function( resolve, reject ) {
        if ( !validator.validForUpdate ) {
            var error = new Error( 'Schema validation failed: ' + validator.issues.join(', ') );

            _this.emit( schema + ':updatefail', {
                id: data.id,
                err: error
            });

            throw error;
        }

        _this._repository
            .update( schema, _onBeforeTransforms( _this._beforeUpdate[schema], data ) )
            .then( _this._factories[schema] )
            .then(function( doc ) {
              _this.emit( schema + ':updated', doc );
  
              resolve( doc );
            })
            .catch(function( err ) {
                  _this.emit( schema + ':updatefail', {
                      id: data._id,
                      err: err
                  });

                  reject( err );
            });

    });
};

Adapter.prototype.delete = function( schema, id ) {
    var _this = this;

    return this._repository
        .delete( schema, id )
        .catch(function( err ) {
              _this.emit( schema + ':deletefail', {
                  id: data._id,
                  err: err
              });
        });
};

Adapter.prototype.find = function( schema, id ) {
    var _this = this;

    return this._repository
        .find( schema, id )
        .then( _this._factories[schema] );
};

Adapter.prototype.findMany = function( schema, ids ) {
    var _this = this;

    return this._repository
        .findMany( schema, ids )
        .then(function( resources ) {
            return resources.map(function( resource ) {
                return new _this._factories[schema]( resource );
            });
        });
};

Adapter.prototype.findAll = function( schema ) {
    return this.findMany( schema );
};

// private methods

function _onBeforeTransforms( transforms, data ) {
  if (transforms && transforms.length) {
    transforms.forEach(function( transform ) {
        data = transform( data );
    });
  }

  return data;
}

function watchForChanges( adapter, options ) {
  adapter.db
    .changes( options )
    .on('create', function( ev ) {
      var doc = ev.doc;
      adapter.emit( doc.doctype + ':created', doc );
    })
    .on('update', function( ev ) {
      var doc = ev.doc;
      adapter.emit( doc.doctype + ':updated', doc );
    })
    .on('delete', function( ev ) {
      var doc = ev.doc;
      adapter.emit( doc.doctype + ':deleted', doc );
    });
}

module.exports = Adapter;
