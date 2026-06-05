/*++

    Audapp Multi-Endpoint Driver — Channel Table

    Audapp-owned source (NOT derived from the Microsoft ACX sample). Safe to
    commit. Defines the four Audapp render endpoints exposed by the experimental
    multi-endpoint driver (Phase 21B, compile-only).

    Each entry maps one internal Audapp channel to:
      - a unique, freshly generated circuit component GUID,
      - an ACX circuit name (handle name used to open the device),
      - an INF AddInterface reference string (MUST match AudioMulti.inf exactly),
      - the endpoint FriendlyName the INF assigns.

    Design notes:
      - The type, count and an `extern` declaration of the table are always
        available to any translation unit that includes this header.
      - The concrete GUID/name/table *storage* is emitted exactly once, in the
        single translation unit that defines AUDAPP_CHANNELS_IMPL before
        including this header (Device.cpp). This avoids duplicate-symbol link
        errors while still keeping all channel data in one place.
      - These component GUIDs are brand new and intentionally distinct from the
        shipping single-endpoint render GUID (CODEC_RENDER_COMPONENT_GUID in
        DriverSettings.h) so the experimental package can never be confused with
        the live "Audapp Input" device.

    Environment:

        Kernel mode

--*/

#ifndef AUDAPP_CHANNELS_H
#define AUDAPP_CHANNELS_H

//
// Number of Audapp render endpoints exposed by the multi-endpoint driver.
//
#define AUDAPP_RENDER_CHANNEL_COUNT 4

//
// One Audapp render endpoint definition. Pointers reference storage with
// static lifetime (see the IMPL block below), so the table is safe to share.
//
typedef struct _AUDAPP_RENDER_CHANNEL {
    PCWSTR                  InternalId;       // Audapp internal channel id, diagnostic only ("general"...).
    const GUID*             ComponentGuid;    // Unique circuit component id.
    const UNICODE_STRING*   CircuitName;      // ACX circuit name; matches the INF interface reference string.
    PCWSTR                  ReferenceString;  // INF AddInterface reference string (e.g. L"SpeakerGeneral").
    PCWSTR                  FriendlyName;      // Endpoint FriendlyName assigned by the INF (e.g. L"Audapp General").
} AUDAPP_RENDER_CHANNEL;

//
// The shared channel table. Storage lives in the AUDAPP_CHANNELS_IMPL TU.
// Declared with C linkage so the declaration (often pulled in via public.h's
// extern "C" block) and the file-scope definition in Device.cpp agree.
//
#ifdef __cplusplus
extern "C" {
#endif
extern const AUDAPP_RENDER_CHANNEL g_AudappRenderChannels[AUDAPP_RENDER_CHANNEL_COUNT];
#ifdef __cplusplus
}
#endif

#endif // AUDAPP_CHANNELS_H

//
// ---------------------------------------------------------------------------
// Single-definition implementation block.
//
// Emitted only in the translation unit that does:
//     #define AUDAPP_CHANNELS_IMPL
//     #include "Channels.h"
// after <initguid.h> (pulled in via public.h) so DEFINE_GUID allocates storage.
// Guarded by AUDAPP_CHANNELS_IMPL_DONE so a prior guard-protected include of the
// type section (e.g. via public.h) does not suppress these definitions.
// ---------------------------------------------------------------------------
//
#if defined(AUDAPP_CHANNELS_IMPL) && !defined(AUDAPP_CHANNELS_IMPL_DONE)
#define AUDAPP_CHANNELS_IMPL_DONE

// Freshly generated component GUIDs (one per endpoint). Distinct from the
// shipping CODEC_RENDER_COMPONENT_GUID.
DEFINE_GUID(AUDAPP_RENDER_GENERAL_GUID, 0xce9d337e, 0x931c, 0x48b1, 0x8b, 0x7c, 0x26, 0x8a, 0x2d, 0xac, 0xcb, 0x1f);
DEFINE_GUID(AUDAPP_RENDER_MUSIC_GUID,   0xf35071ca, 0x8683, 0x4aea, 0x93, 0x6b, 0x10, 0x29, 0x2f, 0x37, 0xc6, 0x3c);
DEFINE_GUID(AUDAPP_RENDER_VOICE_GUID,   0x1bf49d44, 0x3ec2, 0x455f, 0x99, 0x86, 0x75, 0x06, 0x93, 0x00, 0x45, 0x87);
DEFINE_GUID(AUDAPP_RENDER_GAME_GUID,    0x5702375d, 0xcad1, 0x4ead, 0x98, 0xdd, 0x62, 0xbc, 0xfd, 0xd3, 0x25, 0x3c);

// ACX circuit names. These MUST match the INF AddInterface reference strings
// in AudioMulti.inf character-for-character.
DECLARE_CONST_UNICODE_STRING(audappRenderGeneralName, L"SpeakerGeneral");
DECLARE_CONST_UNICODE_STRING(audappRenderMusicName,   L"SpeakerMusic");
DECLARE_CONST_UNICODE_STRING(audappRenderVoiceName,   L"SpeakerVoice");
DECLARE_CONST_UNICODE_STRING(audappRenderGameName,    L"SpeakerGame");

// External linkage (C) definition of the shared table.
#ifdef __cplusplus
extern "C" {
#endif
extern const AUDAPP_RENDER_CHANNEL g_AudappRenderChannels[AUDAPP_RENDER_CHANNEL_COUNT] =
{
    { L"general", &AUDAPP_RENDER_GENERAL_GUID, &audappRenderGeneralName, L"SpeakerGeneral", L"Audapp General" },
    { L"music",   &AUDAPP_RENDER_MUSIC_GUID,   &audappRenderMusicName,   L"SpeakerMusic",   L"Audapp Music"   },
    { L"voice",   &AUDAPP_RENDER_VOICE_GUID,   &audappRenderVoiceName,   L"SpeakerVoice",   L"Audapp Voice"   },
    { L"game",    &AUDAPP_RENDER_GAME_GUID,    &audappRenderGameName,    L"SpeakerGame",    L"Audapp Game"    },
};
#ifdef __cplusplus
}
#endif

#endif // AUDAPP_CHANNELS_IMPL && !AUDAPP_CHANNELS_IMPL_DONE
