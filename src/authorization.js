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

(function(document) {
  var electron = window.require('electron');
  const NestApplicationInterface = window.NestApplicationInterface;

  var authWindow;
  var pincodeInput = document.getElementById('pincode-input');
  var connectedStatus = document.getElementById('connected-status');
  var connectedSpinner = document.getElementById('connected-spinner');
  var setupDiv = document.getElementById('setup');
  var apiButton = document.getElementById('api-button');
  var config = require('../config.json');
  var fs = require('fs');

  let pincodeButton = document.getElementById('pincode-button');
  let cancelPincodeButton = document.getElementById('cancel-pincode-button');

  // if the user doesn't yet have a token, do the OAuth flow
  if(config.token === "your_token"){
    // do OAuth flow for the first time to get the token
    apiButton.addEventListener('click', function(){
      apiButton.disabled = true;
      let OauthUrl = "https://home.nest.com/login/oauth2?client_id=" + config.clientId + "&state=FOO";

      authWindow = new electron.remote.BrowserWindow({
          width: 800
          , height: 600
          , show: true
          , 'webPreferences': {
              'nodeIntegration': false
          }
      });

      authWindow.loadURL(OauthUrl);
    });

    pincodeButton.addEventListener('click', function(){
      // modify the UI to show that the API is being connected to
      connectedStatus.innerHTML = 'Connecting';
      connectedSpinner.active = true;

      NestApplicationInterface.doOauth( pincodeInput.value, config.productID, config.productSecret ).then(
        (result) => {
          console.log("OAuth finished, result: ", result);

          //token should be something similar to 'result.token', although this may be wrong
          config.token = result.token;
          NestApplicationInterface.setToken(result.token);

          // update the config file
          fs.writeFile('../config.json', JSON.stringify(config, null, 2), function(error){
            if(error) {return console.warn(error);}
          });

          NestApplicationInterface.streamServiceChanges();

          NestApplicationInterface.addHydratedListener(function(){
            // modify the UI to show that the user is connected to the API
            connectedStatus.innerHTML = 'Connected';
            setupDiv.className = 'display-none';
            connectedSpinner.active = false;
          });

        },
        (err) => {
          connectedStatus.innerHTML = 'Disconnected';
          console.error(err);
        }
      );

      //user may have already closed the Nest auth window, catch the error
      try {
        authWindow.close();
      }
      catch (e) {

      }
    });

    cancelPincodeButton.addEventListener('click', function(){
      pincodeInput.value = "";
      apiButton.disabled = false;
      //user may have already closed the Nest auth window, catch the error
      try {
        authWindow.close();
      }
      catch (e) {

      }
    });
  }
  else{
    // change some things in the UI
    connectedStatus.innerHTML = 'Connecting';
    connectedSpinner.active = true;
    setupDiv.className = 'display-none';

    // token already exists, don't redo OAuth flow
    NestApplicationInterface.setToken(config.token);

    NestApplicationInterface.streamServiceChanges();

    NestApplicationInterface.addHydratedListener(function(){
      connectedStatus.innerHTML = 'Connected';
      connectedSpinner.active = false;
    });
  }

})(document);
