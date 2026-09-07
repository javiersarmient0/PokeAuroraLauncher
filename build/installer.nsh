!macro customUnInstallSection

  Section /o "un.Eliminar datos de PokeAurora"

    ; Removes the launcher-managed user data, including the Minecraft instance,
    ; downloaded files, libraries, caches and launcher configuration.
    ; The section is optional and unchecked by default.
    RMDir /r "$APPDATA\.PokeAuroraLauncher"

  SectionEnd

!macroend
