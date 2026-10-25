# FFmpeg notice

This product includes `ffprobe` from FFmpeg 9.0.2. FFmpeg is licensed under the GNU Lesser General Public License, version 2.1 or later. The accompanying license text is `FFmpeg-LICENSE-LGPL-2.1.txt`.

This build reports `LGPL version 2.1 or later`; it was configured with `--disable-gpl` and `--disable-nonfree`, uses no external Homebrew libraries, and includes only the `ffprobe` program. It is a universal macOS binary for `arm64` and `x86_64`.

The corresponding unmodified FFmpeg 9.0.2 source archive and its upstream PGP signature are published as assets on this release:

- https://github.com/plouis375/rpm-resolve-project-manager/releases/download/v0.07/ffmpeg-9.0.2.tar.xz
- https://github.com/plouis375/rpm-resolve-project-manager/releases/download/v0.07/ffmpeg-9.0.2.tar.xz.asc

The upstream source archive SHA-256 is `8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e`.

Build configuration for both architectures:

```text
--target-os=darwin
--enable-static --disable-shared
--disable-gpl --disable-nonfree
--disable-network --disable-autodetect
--disable-doc --disable-debug --disable-everything
--enable-ffprobe
--enable-demuxer=mov,mxf,avi,mpegps,matroska,mpegts,r3d,m4v,wav,aiff,mp3,flac,ogg,aac,asf,image2
--enable-parser=aac,h264,hevc,prores,dnxhd,mpegvideo,mjpeg,dpx
--enable-protocol=file
--disable-avdevice --disable-avfilter --disable-encoders --disable-decoders --disable-swscale
--enable-small --disable-x86asm
```

The x86_64 build targets macOS 10.15 or later and the arm64 build targets macOS 11 or later. Each architecture-specific binary was built from the corresponding source archive and combined with Apple's `lipo` tool.
