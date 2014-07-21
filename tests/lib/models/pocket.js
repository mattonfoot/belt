

function Pocket( data ) {
    this.id = data.id;
    this.title = data.title;

    data.links = data.links || {};
    this.links = {};
    this.links.wall = data.links.wall;
    this.links.cards = data.links.cards || [];
    this.links.regions = data.links.regions || [];
}

Pocket.prototype.getId = function() {
    return this.id;
};

Pocket.prototype.getName = function() {
    return this.name;
};

Pocket.prototype.getWall = function() {
    return this.links.wall;
};
Pocket.prototype.getCards = function() {
    return this.links.cards;
};

Pocket.prototype.getRegions = function() {
    return this.links.regions;
};

Pocket.constructor = function( data ) {
    if ( data instanceof Pocket ) {
        return data;
    }

    return new Pocket( data );
};

Pocket.schema = {
    title: String,
    cardnumber: Number,
    content: String,     // [ 'fragment' ]
    tags: String,        // [ 'tag' ]
    mentions: String,    // [ 'mention' ] --> 'user', 'group'
    color: String,
    wall: 'wall',
    cards: ['card'],
    regions: ['region']
    , createdBy: 'user'
    , createdOn: Date
    , lastModifiedBy: 'user'
    , lastModifiedOn: Date
};

Pocket.validator = function( data ) {
    var validator = {
        validForUpdate: true
      , validForCreate: true
      , issues: []
    };

    if ( !data.id ) {
        validator.validForUpdate = false;
        validator.issues.push( 'ID is required' );
    }

    if ( !data.title || data.title === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Title is required' );
    }

    if ( !data.wall || data.wall === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Wall is required' );
    }

    return validator;
};

Pocket.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    return data;
};

Pocket.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    return data;
};

module.exports = Pocket;
