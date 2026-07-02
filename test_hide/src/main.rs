
use tokio::process::Command;

fn main() {
    let mut cmd = Command::new("cmd");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
}

