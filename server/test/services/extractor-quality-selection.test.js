'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { pickMediaUrl, listCandidateMediaUrls } = require('../../src/services/extractor-service');

test('pickMediaUrl prefers signed TikTok media URLs over unsigned webapp candidates', () => {
  const unsignedHighBitrate =
    'https://v16-webapp.tiktok.com/abcd/video/tos/alisg/tos-alisg-pv-0037/clip/?a=1988&br=12888&bt=6444&mime_type=video_mp4';
  const signedLowerBitrate =
    'https://v16-webapp-prime.tiktok.com/video/tos/alisg/tos-alisg-pve-0037c001/clip/?a=1988&br=2046&bt=1023&mime_type=video_mp4&expire=1771651195&policy=2&signature=abc123';

  const selected = pickMediaUrl([unsignedHighBitrate, signedLowerBitrate]);

  assert.equal(selected.mediaUrl, signedLowerBitrate);
  assert.equal(selected.sourceType, 'direct');
});

test('listCandidateMediaUrls excludes audio-only mime_type candidates', () => {
  const audioUrl =
    'https://v77.tiktokcdn.com/path/video/tos/useast2a/clip/?br=250&bt=125&mime_type=audio_mpeg';
  const videoUrl =
    'https://v16-webapp-prime.tiktok.com/video/tos/alisg/clip/?br=834&bt=417&mime_type=video_mp4&expire=1771651195&policy=2&signature=abc123';

  const candidates = listCandidateMediaUrls([audioUrl, videoUrl]);

  assert.deepEqual(candidates, [videoUrl]);
});

test('listCandidateMediaUrls excludes known static playback assets', () => {
  const staticPlaybackUrl =
    'https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/tiktok/webapp/main/webapp-desktop/playback1.mp4';
  const realVideoUrl =
    'https://v16-webapp-prime.tiktok.com/video/tos/alisg/clip/?br=1566&bt=783&mime_type=video_mp4&expire=1771651195&policy=2&signature=abc123';

  const candidates = listCandidateMediaUrls([staticPlaybackUrl, realVideoUrl]);

  assert.deepEqual(candidates, [realVideoUrl]);
});

test('pickMediaUrl does not fall back to login placeholder media when no real candidates exist', () => {
  const placeholder =
    'https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/tiktok/webapp/main/webapp-desktop/playback1.mp4';

  const selected = pickMediaUrl([placeholder]);

  assert.equal(selected.mediaUrl, '');
  assert.equal(selected.sourceType, 'unknown');
  assert.deepEqual(selected.candidateUrls, []);
});

test('pickMediaUrl selects valid candidate when placeholder is also present', () => {
  const placeholder =
    'https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/tiktok/webapp/main/webapp-desktop/playback1.mp4';
  const realVideo =
    'https://v16-webapp-prime.tiktok.com/video/tos/alisg/clip/?br=1566&bt=783&mime_type=video_mp4&expire=1771651195&policy=2&signature=abc123';

  const selected = pickMediaUrl([placeholder, realVideo]);

  assert.equal(selected.mediaUrl, realVideo);
  assert.equal(selected.sourceType, 'direct');
});

