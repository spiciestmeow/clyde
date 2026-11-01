import os
from PIL import Image

def auto_compress_all_pngs():
    # 1. Get the folder where this script is currently running
    current_folder = os.getcwd()
    
    # 2. Create a folder to store your new WebP files so things stay clean
    output_folder = os.path.join(current_folder, "compressed_webp")
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
        
    print(f"Scanning for PNGs in: {current_folder}\n" + "-"*50)
    
    # 3. Detect and loop through all files in the folder
    png_count = 0
    for filename in os.listdir(current_folder):
        # Check if the file ends with .png (ignores case)
        if filename.lower().endswith('.png'):
            png_count += 1
            input_path = os.path.join(current_folder, filename)
            
            # Change the file extension from .png to .webp
            output_filename = os.path.splitext(filename)[0] + ".webp"
            output_path = os.path.join(output_folder, output_filename)
            
            try:
                # 4. Open and compress the image
                with Image.open(input_path) as img:
                    img.save(output_path, "WEBP", quality=75)
                
                orig_mb = os.path.getsize(input_path) / (1024 * 1024)
                new_kb = os.path.getsize(output_path) / 1024
                print(f"✅ Compressed: {filename} ({orig_mb:.2f} MB -> {new_kb:.2f} KB)")
                
            except Exception as e:
                print(f"❌ Failed to compress {filename}: {e}")
                
    if png_count == 0:
        print("No PNG files found in this folder. Make sure your images are in the same folder as this script!")
    else:
        print("-"*50 + f"\n🎉 Done! Processed {png_count} images. Check the 'compressed_webp' folder.")

# Run the automatic detection
auto_compress_all_pngs()
