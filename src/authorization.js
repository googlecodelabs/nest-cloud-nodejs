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
  var random = require('lodash').random;

  let pincodeButton = document.getElementById('pincode-button');
  let cancelPincodeButton = document.getElementById('cancel-pincode-button');

  function generatePseudoRandomRange ( intLength ) {
      var chars = [];

      for ( var i = 0; i < intLength; i++ ) {

          chars.push(String.fromCharCode(random(97, 122)));
          chars.push(random(0, 9).toString());
      }

      return chars.join("");
  }

  // if the user doesn't yet have a token, do the OAuth flow
  if(config.token === "your_token"){
    // do Pincode flow for the first time to get the token
    apiButton.addEventListener('click', function(){
      apiButton.disabled = true;
      let OauthUrl = "https://home.nest.com/login/oauth2?client_id="
        + config.productID + "&state=" + generatePseudoRandomRange(12);

        //console.log("HERE IS THE RANDOM RANGE URL!", OauthUrl);

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

      NestApplicationInterface.doOauth( config.productID, config.productSecret, pincodeInput.value ).then(
        (result) => {
          console.log("OAuth finished, result: ", result);

          // get the token
          config.token = result.token;

          // update the config file
          fs.writeFile('./config.json', JSON.stringify(config, null, 2), function(error){
            if(error) {return console.warn(error)}
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
