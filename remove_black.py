from PIL import Image

def remove_black(input_path, output_path):
    img = Image.open(input_path)
    img = img.convert("RGBA")
    
    datas = img.getdata()
    newData = []
    
    for item in datas:
        # If it's very dark (close to black), make it transparent
        # The text is blue and orange, so we just check if r, g, b are all low
        if item[0] < 30 and item[1] < 30 and item[2] < 30:
            newData.append((0, 0, 0, 0))
        else:
            newData.append(item)
            
    img.putdata(newData)
    img.save(output_path, "PNG")

remove_black('logos/INSTITUTO.jpg', 'logos/INSTITUTO.png')
