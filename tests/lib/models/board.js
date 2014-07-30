

function Board( data ) {
    for ( var prop in data ) {
        if ( prop === 'links' ) continue;

        this[prop] = data[prop];
    }

    this.cardlocations = [];
    this.regions = [];
    this.transforms = [];

    for ( var link in data.links ) {
        this[link] = data.links[link];
    }

    this.shelf = {};

    this.constructor = Board;
}

Board.prototype.getId = function() {
    return this.id;
};

Board.prototype.getName = function() {
    return this.name;
};

Board.prototype.getWall = function() {
    return this.wall;
};

Board.prototype.getCardLocations = function() {
    return this.cardlocations;
};

Board.prototype.addCardLocation = function( cardlocation ) {
    if ( !~this.cardlocations.indexOf( cardlocation.id ) ) {
        this.cardlocations.push( cardlocation.id );
    }

    return this;
};

Board.prototype.getRegions = function() {
    return this.regions;
};

Board.prototype.addRegion = function( region ) {
    if ( !~this.regions.indexOf( region.id ) ) {
        this.regions.push( region.id );
    }

    return this;
};

Board.prototype.getTransforms = function() {
    return this.transforms;
};

Board.prototype.addTransform = function( transform ) {
    if ( !~this.transforms.indexOf( transform.id ) ) {
        this.transforms.push( transform.id );
    }

    return this;
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
  , cardlocations: ['cardlocation']
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
