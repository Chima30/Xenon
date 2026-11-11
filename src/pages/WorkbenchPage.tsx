import { Video, VideoPlayer } from '@videojs/react/video';
import { FILMS } from '../data/catalog';
import { CinemaSkin } from '../skin';

/**
 * The skin on its own: one video, no catalog, no wheel, no atlas.
 * This is everything a site needs to adopt the skin.
 */
export function WorkbenchPage() {
  const film = FILMS[2]!; // Big Buck Bunny
  return (
    <>
      <h1 className="page-h">Skin workbench: one video, no extras</h1>
      <p className="lede">
        This page uses only <code>CinemaSkin</code> and a plain <code>Video</code>. The Movies/Scenes wheel and My Atlas
        are optional slots, so they simply do not appear here.
      </p>
      <VideoPlayer>
        <CinemaSkin title={film.title} subtitle="Skin only, no catalog">
          <Video src={film.src} playsInline preload="metadata" />
        </CinemaSkin>
      </VideoPlayer>
      <pre className="code">{`<VideoPlayer>
  <CinemaSkin title="My film">
    <Video src="/film.mp4" playsInline />
  </CinemaSkin>
</VideoPlayer>`}</pre>
    </>
  );
}
