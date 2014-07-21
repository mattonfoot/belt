

function Region( data ) {
    for ( var prop in data ) {
        if ( prop === 'links' ) continue;

        this[prop] = data[prop];
    }

    this.pockets = [];

    for ( var link in data.links ) {
        this[link] = data.links[link];
    }

    this.constructor = Region;
/*
    var region = this;

    queue
      .on( this, 'canvasregion:moved', function( data ) {
        if ( region.id === data.region.id &&
            ( region.x != data.x || region.y != data.y ) ) {
          region.moveTo( data.x, data.y );
        }
      })
      .on( this, 'canvasregion:resized', function( data ) {
        if ( region.id === data.region.id &&
            ( region.width != data.width || region.height != data.height ) ) {
          region.resizeTo( data.width, data.height );
        }
      })
      .on( this, 'region:updated', function( data ) {
        if ( region.id === data.id &&
            ( region.width != data.width || region.height != data.height || region.x != data.x || region.y != data.y ) ) {
          region.moveTo( data.x, data.y );
          region.resizeTo( data.width, data.height );
        }
      });
*/
}

Region.prototype.getId = function() {
    return this.id;
};

Region.prototype.getLabel = function() {
    return this.label;
};

Region.prototype.getColor = function() {
    return this.color;
};

Region.prototype.getValue = function() {
    return this.value;
};

Region.prototype.getBoard = function() {
    return this.board;
};

Region.prototype.getPockets = function() {
    return this.pockets;
};

Region.prototype.addPocket = function( pocket ) {
    if ( ~this.pockets.indexOf( pocket.id ) ) {
        this.pockets.push( pocket.id );
    }

    return this;
};

Region.prototype.moveTo = function( x, y ) {
    if ( this.x !== x || this.y !== y ) {
        this.x = x;
        this.y = y;
    }

    return this;
};

Region.prototype.resizeTo = function( width, height ) {
    if ( this.width !== width || this.height !== height ) {
        this.width = width;
        this.height = height;
    }

    return this;
};

Region.constructor = function( data ) {
    if ( data instanceof Region ) {
        return data;
    }

    return new Region( data );
};

Region.schema = {
    label: String
  , value: String
  , color: String
  , x: Number
  , y: Number
  , width: Number
  , height: Number
  , board: 'board'
  , pockets: ['pocket']
  , createdBy: 'user'
  , createdOn: Date
  , lastModifiedBy: 'user'
  , lastModifiedOn: Date
};

Region.validator = function( data ) {
    var validator = {
        validForUpdate: true
      , validForCreate: true
      , issues: []
    };

    if ( !data.id ) {
        validator.validForUpdate = false;
        validator.issues.push( 'ID is required' );
    }

    if ( !data.label || data.label === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Label is required' );
    }

    if ( !data.board || data.board === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Board is required' );
    }

    return validator;
};

Region.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    return data;
};

Region.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    return data;
};

module.exports = Region;
