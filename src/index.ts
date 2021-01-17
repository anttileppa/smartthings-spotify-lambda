'use strict';

import { lambda } from "st-schema";
import SpotifyWebApi from "spotify-web-api-node";

/**
 * Spotify playlist device id
 */
interface PlaylistDeviceId {
  deviceId: string;
  playlistUri: string;
}

/**
 * Spotify playlist device
 */
interface PlaylistDevice {
  id: PlaylistDeviceId;
  name: string;
  model: string;
}

/**
 * Returns SmathThings external id as playlist device id
 * 
 * @param externalId SmathThings external id
 * @returns playlist device id
 */
const externalIdToPlaylistDeviceId = (externalId: string): PlaylistDeviceId => {
  const split = externalId.split("|", 2);
  return {
    deviceId: split[0],
    playlistUri: split[1]
  }
}

/**
 * Returns playlist device id as SmathThings external id
 * 
 * @param playlistDeviceId playlist device id
 * @returns SmathThings external id
 */
const playlistDeviceIdToExternalId = (playlistDeviceId: PlaylistDeviceId) => {
  return `${playlistDeviceId.deviceId}|${playlistDeviceId.playlistUri}`;
}

/**
 * Returns authenticated Spotify instance
 * 
 * @param request request
 */
const getSpotify = (request: { authentication: { token: string } }) => {
  const spotify = new SpotifyWebApi();
  spotify.setAccessToken(request.authentication.token);
  return spotify;
}

/**
 * Returns playlist devices from Spotify
 * 
 * @param spotify spotify client instance
 */
const getPlaylistDevices = async (spotify: SpotifyWebApi): Promise<PlaylistDevice[]> => {
  const spotifyDevices = (await spotify.getMyDevices()).body.devices;
  const playlists = (await spotify.getUserPlaylists()).body.items;
  const result: PlaylistDevice[] = [];

  spotifyDevices
    .filter(spotifyDevice => !!spotifyDevice.id)
    .filter(spotifyDevice => spotifyDevice.name === "Mobile Web Player")
    .forEach(spotifyDevice => {
      playlists.forEach(playlist => {
        result.push({
          id: {
            deviceId: spotifyDevice.id!,
            playlistUri: playlist.uri
          },
          name: `Playlist ${playlist.name} on ${spotifyDevice.name}`,
          model: spotifyDevice.type
        });
      });
    });

  return result;
}

/**
 * Handler for discovery request
 * 
 * @param request request
 * @param response response
 */
const discoveryRequest = async (request: any, response: any) => {
  const spotify = getSpotify(request);
  const playlistDevices = await getPlaylistDevices(spotify);

  playlistDevices.forEach(playlistDevice => {
    const id = playlistDeviceIdToExternalId(playlistDevice.id);
    response.addDevice(id, playlistDevice.name, '0284c595-fed5-4b00-9e02-6e85bb3b32fb')
      .manufacturerName('Spotify')
      .modelName(playlistDevice.model);
  });
}

/**
 * Handler for refresh request
 * 
 * @param request request
 * @param response response
 */
const stateRefreshRequest = async (request: any, response: any) => {
  const spotify = getSpotify(request);
  const playlistDevices = await getPlaylistDevices(spotify);
  const playbackState = (await spotify.getMyCurrentPlaybackState()).body;

  playlistDevices.forEach(playlistDevice => {
    const id = playlistDeviceIdToExternalId(playlistDevice.id);
    response.addDevice(id, [
      {
        component: 'main',
        capability: 'st.mediaPlayback',
        attribute: 'supportedPlaybackCommands',
        value: ["pause", "play", "fastForward", "rewind"]
      },
      {
        component: 'main',
        capability: 'st.mediaPlayback',
        attribute: 'playbackStatus',
        value: playbackState.is_playing ? "playing" : "paused"
      }
    ]);
  });
}

/**
 * Handler for command request
 * 
 * @param request request
 * @param response response
 */
const commandRequest = async (request: any, response: any) => {
  const spotify = getSpotify(request);

  await Promise.all(request.devices.map(async (deviceRequest: any) => {
    const externalId = deviceRequest.externalDeviceId;
    const device = response.addDevice(externalId);
    const component = device.addComponent("main");
    const playlistDeviceId = externalIdToPlaylistDeviceId(externalId);

    return await Promise.all(deviceRequest.commands.map(async (command: any) => {
      switch (command.capability) {
        case 'st.mediaPlayback':
          switch (command.command) {
            case "play":
              await spotify.play({
                context_uri: playlistDeviceId.playlistUri,
                device_id: playlistDeviceId.deviceId
              });

              component.addState(command.capability, 'playbackStatus', 'playing');
            break;
            case "pause":
              try {
                await spotify.pause({
                  device_id: playlistDeviceId.deviceId
                });
              } catch (e) {
                console.error("Spotify pause failed");
              }
              
              component.addState(command.capability, 'playbackStatus', 'paused');
            break;
            case "fastForward":
              try {
                await spotify.skipToNext();
              } catch (e) {
                console.error("Spotify next failed");
              }
              
              component.addState(command.capability, 'playbackStatus', 'playing');
            break;
            case "rewind":
              try {
                await spotify.skipToPrevious();
              } catch (e) {
                console.error("Spotify prev failed");
              }
              
              component.addState(command.capability, 'playbackStatus', 'playing');
            break;
          }
        break;
      }

      return null;
    }));
  }));
}

/**
 * Promisifies the SmartThings lambda function
 * 
 * @param body request body as JSON object
 * @returns response
 */
const promiseHandler = (body: any) => {
  return new Promise((resolve) => {
    const handler = lambda({
      discoveryRequest,
      commandRequest,
      stateRefreshRequest
    });

    handler(body, {
      succeed: (response: any) => {
        resolve({
          statusCode: 200,
          body: JSON.stringify(response)
        });
      },
      fail: (response: any) => {
        resolve({
          statusCode: 500,
          body: JSON.stringify(response)
        });
      },
    });
  });
}

/**
 * Lambda entrypoint
 */
exports.handler = async (event: { body: string, headers: { [key: string]: string } }) => {
  try {
    const body = JSON.parse(event.body);

    if (body.headers && body.headers.interactionType === "interactionResult") {
      console.error("interactionResult", JSON.stringify(body, null, 2));        
    }

    return await promiseHandler(body);
  } catch (e) {
    return {
      statusCode: 500,
      body: e.message
    }
  }
}