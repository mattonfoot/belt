var queryPhraseParser = require('../queryPhraseParser');


function Transform( data ) {
    for ( var prop in data ) {
        if ( prop === 'links' ) continue;

        this[prop] = data[prop];
    }

    for ( var link in data.links ) {
        this[link] = data.links[link];
    }

    this.constructor = Transform;
}

Transform.prototype.getId = function() {
    return this.id;
};

Transform.prototype.getPhrase = function() {
    return this.phrase;
};

Transform.prototype.getRules = function() {
    return this.rules;
};

Transform.prototype.getBoard = function() {
    return this.board;
};

Transform.constructor = function( data ) {
    if ( data instanceof Transform ) {
        return data;
    }

    return new Transform( data );
};

Transform.schema = {
    phrase: String
  , rules: Object
  , board: 'board'
  , createdBy: 'user'
  , createdOn: Date
  , lastModifiedBy: 'user'
  , lastModifiedOn: Date
};

Transform.validator = function( data ) {
    var validator = {
        validForUpdate: true
      , validForCreate: true
      , issues: []
    };

    if ( !data.id ) {
        validator.validForUpdate = false;
        validator.issues.push( 'ID is required' );
    }

    if ( !data.phrase || data.phrase === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Phrase is required' );
    }

    if ( !data.board ) {
        validator.validForUpdate = false;
        validator.issues.push( 'Board is required' );
    }

    return validator;
};

Transform.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    data.rules = queryPhraseParser( data.phrase );

    return data;
};

Transform.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    data.rules = queryPhraseParser( data.phrase );

    return data;
};

module.exports = Transform;
