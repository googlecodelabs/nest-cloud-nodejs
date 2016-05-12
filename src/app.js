// This file contains the application logic for the web app
(function(document) {
  'use strict';

  // define application interface
  const NestApplicationInterface = require('./nest/NestApplicationInterface');
  window.NestApplicationInterface = NestApplicationInterface;

  // listen for update events:
  NestApplicationInterface.addUpdateListener(function(){
    console.log("update event");
  });

  // listen for hydrated events:
  NestApplicationInterface.addHydratedListener(function(){
    console.log("hydrate event");
  });

})(document);
