// Copyright 2016 Google Inc.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//      http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
