# Song library

Drop exported `.txt` songs here. Subfolders become groups in the app's Library.

A section can reuse a library file instead of having its own lines:

    [groove] = grooves/samba-basic        # songs/grooves/samba-basic.txt
    [break2] = breaks/bossa-1#break       # one section of a file with several

Changing a file here changes it in every song that links to it.
