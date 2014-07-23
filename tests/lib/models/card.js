

function Card( data ) {
    for ( var prop in data ) {
        if ( prop === 'links' ) continue;

        this[prop] = data[prop];
    }

    for ( var link in data.links ) {
        this[link] = data.links[link];
    }

    this.constructor = Card;
}

Card.prototype.getId = function() {
    return this.id;
};

Card.prototype.getPocket = function() {
    return this.pocket;
};

Card.prototype.getBoard = function() {
    return this.board;
};

Card.prototype.getPosition = function() {
    return {
        board: this.board,
        x: this.x,
        y: this.y
    };
};

Card.prototype.moveTo = function( x, y ) {
    if ( this.x !== x || this.y !== y ) {
        this.x = x;
        this.y = y;
    }

    return this;
};

Card.constructor = function( data ) {
    if ( data instanceof Card ) {
        return data;
    }

    return new Card( data );
};

Card.schema = {
    x: Number,
    y: Number,
    board: 'board',
    pocket: 'pocket'
  , createdBy: 'user'
  , createdOn: Date
  , lastModifiedBy: 'user'
  , lastModifiedOn: Date
};

Card.validator = function( data ) {
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

Card.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    return data;
};

Card.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    return data;
};

module.exports = Card;
