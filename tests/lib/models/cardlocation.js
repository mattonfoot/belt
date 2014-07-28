

function CardLocation( data ) {
    for ( var prop in data ) {
        if ( prop === 'links' ) continue;

        this[prop] = data[prop];
    }

    for ( var link in data.links ) {
        this[link] = data.links[link];
    }

    this.constructor = CardLocation;
}

CardLocation.prototype.getId = function() {
    return this.id;
};

CardLocation.prototype.getX = function() {
    return this.x;
};

CardLocation.prototype.getY = function() {
    return this.y;
};

CardLocation.prototype.getPocket = function() {
    return this.pocket;
};

CardLocation.prototype.getBoard = function() {
    return this.board;
};

CardLocation.prototype.getPosition = function() {
    return {
        id: this.id,
        board: this.board,
        x: this.x,
        y: this.y
    };
};

CardLocation.prototype.moveTo = function( x, y ) {
    if ( this.x !== x || this.y !== y ) {
        this.x = x;
        this.y = y;
    }

    return this;
};

CardLocation.constructor = function( data ) {
    if ( data instanceof CardLocation ) {
        return data;
    }

    return new CardLocation( data );
};

CardLocation.schema = {
    x: Number,
    y: Number,
    board: 'board',
    pocket: 'pocket'
  , createdBy: 'user'
  , createdOn: Date
  , lastModifiedBy: 'user'
  , lastModifiedOn: Date
};

CardLocation.validator = function( data ) {
    var validator = {
        validForUpdate: true
      , validForCreate: true
      , issues: []
    };

    if ( !data.id ) {
        validator.validForUpdate = false;
        validator.issues.push( 'ID is required' );
    }

    if ( !data.pocket || data.pocket === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Pocket is required' );
    }

    if ( !data.board || data.board === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Board is required' );
    }

    return validator;
};

CardLocation.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    return data;
};

CardLocation.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    data.x = data.x || 20;
    data.y = data.y || 20;

    return data;
};

module.exports = CardLocation;
