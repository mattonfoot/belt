var util = require("util")
  , events = require("events")
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
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
    this._repository = new Repository( dbname, options );

    events.EventEmitter.call(this);
}

util.inherits( Adapter, events.EventEmitter );

Adapter.prototype.constructor = Adapter;

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

    if ( !validator.validForCreate ) {
        _this.emit( schema + ':createfail', {
            id: data.id,
            err: new Error( validator.issues.join(', ') )
        });

        return;
    }

    return this._repository
        .create( schema, _onBeforeTransforms( _this._beforeCreate[schema], data ) )
        .then( _this._factories[schema] )
        .then(function( doc ) {
              _this.emit( schema + ':created', doc );

              return doc;
        })
        .catch(function( err ) {
              _this.emit( schema + ':createfail', {
                  id: data._id,
                  err: err
              });
        });
};

Adapter.prototype.update = function( schema, data ) {
    var _this = this
      , validator = _this._validators[schema]( data );

    if ( !validator.validForUpdate ) {
        _this.emit( schema + ':updatefail', {
            id: data.id,
            err: new Error( validator.issues.join(', ') )
        });

        return;
    }

    return this._repository
        .update( schema, _onBeforeTransforms( _this._beforeUpdate[schema], data ) )
        .then( _this._factories[schema] )
        .then(function( doc ) {
              _this.emit( schema + ':updated', doc );

              return doc;
        })
        .catch(function( err ) {
              _this.emit( schema + ':updatefail', {
                  id: data._id,
                  err: err
              });
        });
};

Adapter.prototype.delete = function( schema, id ) {
    var _this = this;

    return this._repository
        .delete( schema, id )
        .then(function( doc ) {
              _this.emit( schema + ':deleted', doc );

              return doc;
        })
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
    transforms
        .forEach(function( transform ) {
            data = transform( data );
        });

    return data;
}

module.exports = Adapter;
