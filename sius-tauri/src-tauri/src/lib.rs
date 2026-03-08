use glob::glob;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Shot {
    pub nr: String,
    pub val: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Entry {
    pub fields: HashMap<String, String>,
    pub lap_details: Vec<Shot>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParseResult {
    pub xml_obj: Vec<Entry>,
    pub race_details: HashMap<String, String>,
}

pub struct AppState {
    pub folder_path: Mutex<String>,
    pub api_url: Mutex<String>,
}

fn search_xml(folder: &str) -> Option<String> {
    let pattern = format!("{}/**/*.issf.xml", folder);
    let files: Vec<String> = glob(&pattern)
        .ok()?
        .filter_map(|f| f.ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    // Prefer files with "Temp" in the path
    for f in &files {
        if f.contains("Temp") {
            return Some(f.clone());
        }
    }
    files.into_iter().next()
}

fn parse_xml(file_path: &str) -> Result<ParseResult, String> {
    let content = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let mut reader = Reader::from_str(&content);
    reader.trim_text(true);

    let mut race_details = HashMap::new();
    let mut entries: Vec<Entry> = Vec::new();
    let mut current_section = String::new();
    let mut in_entry = false;
    let mut in_competition_shots = false;
    let mut current_entry = Entry {
        fields: HashMap::new(),
        lap_details: Vec::new(),
    };
    let mut current_tag = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "meta_champship" | "meta_file" | "meta_list" => {
                        current_section = name;
                    }
                    "entry" => {
                        in_entry = true;
                        current_entry = Entry {
                            fields: HashMap::new(),
                            lap_details: Vec::new(),
                        };
                    }
                    "competition_shots" => {
                        in_competition_shots = true;
                    }
                    _ => {
                        if in_entry && !in_competition_shots {
                            current_tag = name;
                        } else if !current_section.is_empty() && !in_entry {
                            current_tag = name;
                        }
                    }
                }
            }
            Ok(Event::Empty(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "shot" && in_competition_shots {
                    let mut shot = Shot {
                        nr: String::new(),
                        val: String::new(),
                    };
                    for attr in e.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                        let val = String::from_utf8_lossy(&attr.value).to_string();
                        match key.as_str() {
                            "nr" => shot.nr = val,
                            "val" => shot.val = val,
                            _ => {}
                        }
                    }
                    current_entry.lap_details.push(shot);
                }
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().unwrap_or_default().trim().to_string();
                if !text.is_empty() {
                    if in_entry && !in_competition_shots && !current_tag.is_empty() {
                        current_entry
                            .fields
                            .insert(current_tag.clone(), text.clone());
                    } else if !current_section.is_empty() && !current_tag.is_empty() {
                        race_details.insert(current_tag.clone(), text.clone());
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "meta_champship" | "meta_file" | "meta_list" => {
                        current_section.clear();
                    }
                    "entry" => {
                        in_entry = false;
                        entries.push(current_entry.clone());
                    }
                    "competition_shots" => {
                        in_competition_shots = false;
                    }
                    _ => {
                        current_tag.clear();
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
    }

    Ok(ParseResult {
        xml_obj: entries,
        race_details,
    })
}

#[tauri::command]
async fn select_folder() -> Result<String, String> {
    // Folder selection handled from the frontend
    Ok(String::new())
}

#[tauri::command]
fn set_folder(state: State<AppState>, path: String) -> Result<(), String> {
    *state.folder_path.lock().unwrap() = path;
    Ok(())
}

#[tauri::command]
fn set_api_url(state: State<AppState>, url: String) -> Result<(), String> {
    *state.api_url.lock().unwrap() = url.trim().to_string();
    Ok(())
}

#[tauri::command]
async fn poll_and_send(state: State<'_, AppState>) -> Result<String, String> {
    let folder = state.folder_path.lock().unwrap().clone();
    let api_url = state.api_url.lock().unwrap().clone();

    if folder.is_empty() {
        return Err("No folder selected".to_string());
    }
    if api_url.is_empty() {
        return Err("No API URL set".to_string());
    }

    let xml_path = search_xml(&folder).ok_or("No .issf.xml files found in selected folder")?;
    let result = parse_xml(&xml_path)?;

    let client = reqwest::Client::new();
    let resp = client
        .post(&api_url)
        .json(&result)
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();

    Ok(format!(
        "{{\"status\":{},\"body\":{},\"file\":\"{}\",\"competitors\":{}}}",
        status,
        body,
        xml_path,
        result.xml_obj.len()
    ))
}

#[tauri::command]
fn preview_data(state: State<AppState>) -> Result<ParseResult, String> {
    let folder = state.folder_path.lock().unwrap().clone();
    if folder.is_empty() {
        return Err("No folder selected".to_string());
    }
    let xml_path = search_xml(&folder).ok_or("No .issf.xml files found")?;
    parse_xml(&xml_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            folder_path: Mutex::new(String::new()),
            api_url: Mutex::new("http://localhost:5001/start_race".to_string()),
        })
        .invoke_handler(tauri::generate_handler![
            select_folder,
            set_folder,
            set_api_url,
            poll_and_send,
            preview_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
