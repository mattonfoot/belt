

function Region( data ) {
    this.id = data.id;
    this.label = data.label;
    this.value = data.value;

    data.links = data.links || {};
    this.links = {};
    this.links.board = data.links.board;
    this.links.pockets = data.links.pockets || [];
}

Region.prototype.getId = function() {
    return this.id;
};

Region.prototype.getLabel = function() {
    return this.label;
};

Region.prototype.getValue = function() {
    return this.value;
};

Region.prototype.getBoard = function() {
    return this.links.board;
};
Region.prototype.getPockets = function() {
    return this.links.pockets;
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
