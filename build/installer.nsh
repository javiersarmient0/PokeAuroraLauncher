!macro customUnInstallSection

  Section /o "Eliminar datos de PokeAurora"

    ; Removes the launcher-managed user data, including the Minecraft instance,
    ; downloaded files, libraries, caches and launcher configuration.
    ; The section is optional so users can keep their data when uninstalling.
    RMDir /r "$APPDATA\.PokeAuroraLauncher"

  SectionEnd

!macroend
