var util = require("util")
  , events = require("events")
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Belt = require('./repository');

// Adapter
//    .resource( 'card', ModelFactory.constructor )
//    .schema( ModelFactory.schema )
//    .validator( ModelFactory.validator )
//    .beforeCreate( onBeforeCreate )         // function returns data to succeed, returns falsey to fail
//    .beforeUpdate( onBeforeUpdate );        // function returns data to succeed, returns falsey to fail

// public interface

function Adapter( dbname, options ) {
    this._belt = new Belt( dbname, options );

    events.EventEmitter.call(this);
}

util.inherits( Belt, events.EventEmitter );

Adapter.prototype.constructor = Adapter;

Adapter.prototype._context = {};

Adapter.prototype._factories = {};
Adapter.prototype._validators = {};
Adapter.prototype._beforeCreate = {};
Adapter.prototype._beforeUpdate = {};

Adapter.prototype.resource = function( schema, factory ) {
    if (!factory) {
        factory = schema;
        schema = this._context.schema;
    }

    this._factories[schema] = factory;

    this._content.schema = schema;

    return this;
};

Adapter.prototype.schema = function( schema, definition ) {
    if (!definition) {
        definition = schema;
        schema = this._context.schema;
    }

    this._belt.schema( schema, definition, true );

    this._content.schema = schema;

    return this;
};

Adapter.prototype.validator = function( schema, validator ) {
    if (!validator) {
        validator = schema;
        schema = this._context.schema;
    }

    this._validators[schema] = validator;

    this._content.schema = schema;

    return this;
};

Adapter.prototype.beforeCreate = function( schema, transform ) {
    if (!transform) {
        transform = schema;
        schema = this._context.schema;
    }

    this._beforeCreate[schema] = this._beforeCreate[schema] || [];
    this._beforeCreate[schema].push(transform);

    this._content.schema = schema;

    return this;
};

Adapter.prototype.beforeUpdate = function( schema, transform ) {
    if (!transform) {
        transform = schema;
        schema = this._context.schema;
    }

    this._beforeUpdate[schema] = this._beforeUpdate[schema] || [];
    this._beforeUpdate[schema].push(transform);

    this._content.schema = schema;

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

    return this._belt
        .post( _onBeforeTransforms( _this._beforeCreate[schema], data ) )
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

    return this._belt
        .put( _onBeforeTransforms( _this._beforeUpdate[schema], data ) )
        .catch(function( err ) {
              _this.emit( schema + ':updatefail', {
                  id: data._id,
                  err: err
              });
        });
};

Adapter.prototype.delete = function( schema, id ) {
    var _this = this;

    return this._belt
        .remove( id )
        .catch(function( err ) {
              _this.emit( schema + ':deletefail', {
                  id: data._id,
                  err: err
              });
        });
};

Adapter.prototype.get = function( schema, id ) {
    var _this = this;

    return this._belt
        .find( id )
        .then(function( resource ) {
            return new _this._factories[schema]( resource );
        });
};

Adapter.prototype.list = function( schema, ids ) {
    var _this = this;

    return this._belt
        .findMany( ids )
        .then(function( resources ) {
            return output.map(function( resource ) {
                return new _this._factories[schema]( resource );
            });
        });
};

Adapter.prototype.all = function( schema ) {
};