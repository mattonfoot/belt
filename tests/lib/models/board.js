

function Board( data ) {
    data.links = data.links || {};

    this.id = data.id;
    this.name = data.name;

    this.links = {};
    this.links.wall = data.links.wall;
    this.links.cards = data.links.cards || [];
    this.links.regions = data.links.regions || [];
}

Board.prototype.getId = function() {
    return this.id;
};

Board.prototype.getName = function() {
    return this.name;
};

Board.prototype.getWall = function() {
    return this.links.wall;
};

Board.prototype.getCards = function() {
    return this.links.cards;
};

Board.prototype.getRegions = function() {
    return this.links.regions;
};

Board.constructor = function( data ) {
    if ( data instanceof Board ) {
        return data;
    }

    return new Board( data );
};

Board.schema = {
    name: String
  , wall: 'wall'
  , cards: ['card']
  , regions: ['region']
  , transforms: ['transform']
  , createdBy: 'user'
  , createdOn: Date
  , lastModifiedBy: 'user'
  , lastModifiedOn: Date
  // , views: [ 'view' ] --> [ 'transform' ]
  // , access: [ 'right' ] --> 'user', 'group'
};

Board.validator = function( data ) {
    var validator = {
        validForUpdate: true
      , validForCreate: true
      , issues: []
    };

    if ( !data.id ) {
        validator.validForUpdate = false;
        validator.issues.push( 'ID is required' );
    }

    if ( !data.name || data.name === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Name is required' );
    }

    if ( !data.wall || data.wall === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Wall is required' );
    }

    return validator;
};

Board.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    return data;
};

Board.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    return data;
};

module.exports = Board;
