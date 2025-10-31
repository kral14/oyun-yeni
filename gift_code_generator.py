#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tower Defense Hədiyyə Kodu Generatoru
Bu proqram istədiyiniz pul, elmas və ulduz miqdarı üçün hədiyyə kodu yaradır.
"""

import tkinter as tk
from tkinter import ttk, messagebox
import json
import base64
import pyperclip


class GiftCodeGenerator:
    def __init__(self, root):
        self.root = root
        self.root.title("🎁 Tower Defense Hədiyyə Kodu Generatoru")
        self.root.geometry("500x400")
        self.root.resizable(False, False)
        
        # Dark theme colors
        bg_color = "#1a1a2e"
        fg_color = "#ffffff"
        input_bg = "#16213e"
        button_bg = "#4a90e2"
        
        self.root.configure(bg=bg_color)
        
        # Style
        style = ttk.Style()
        style.theme_use('clam')
        style.configure('TLabel', background=bg_color, foreground=fg_color, font=('Arial', 11))
        style.configure('TEntry', fieldbackground=input_bg, foreground=fg_color, font=('Arial', 11))
        style.configure('TButton', background=button_bg, foreground=fg_color, font=('Arial', 10, 'bold'))
        
        # Main frame
        main_frame = tk.Frame(root, bg=bg_color, padx=20, pady=20)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Title
        title_label = tk.Label(main_frame, text="🎁 Hədiyyə Kodu Generatoru", 
                              font=('Arial', 16, 'bold'), bg=bg_color, fg="#00d4ff")
        title_label.pack(pady=(0, 20))
        
        # Money input
        money_frame = tk.Frame(main_frame, bg=bg_color)
        money_frame.pack(fill=tk.X, pady=10)
        tk.Label(money_frame, text="💰 Pul miqdarı:", bg=bg_color, fg=fg_color, 
                font=('Arial', 11), width=15, anchor='w').pack(side=tk.LEFT)
        self.money_entry = tk.Entry(money_frame, bg=input_bg, fg=fg_color, 
                                    font=('Arial', 11), width=20, insertbackground=fg_color)
        self.money_entry.pack(side=tk.LEFT, padx=10)
        self.money_entry.insert(0, "5000")
        
        # Diamonds input
        diamonds_frame = tk.Frame(main_frame, bg=bg_color)
        diamonds_frame.pack(fill=tk.X, pady=10)
        tk.Label(diamonds_frame, text="💎 Elmas miqdarı:", bg=bg_color, fg=fg_color, 
                font=('Arial', 11), width=15, anchor='w').pack(side=tk.LEFT)
        self.diamonds_entry = tk.Entry(diamonds_frame, bg=input_bg, fg=fg_color, 
                                       font=('Arial', 11), width=20, insertbackground=fg_color)
        self.diamonds_entry.pack(side=tk.LEFT, padx=10)
        self.diamonds_entry.insert(0, "500")
        
        # Stars input
        stars_frame = tk.Frame(main_frame, bg=bg_color)
        stars_frame.pack(fill=tk.X, pady=10)
        tk.Label(stars_frame, text="⭐ Ulduz miqdarı:", bg=bg_color, fg=fg_color, 
                font=('Arial', 11), width=15, anchor='w').pack(side=tk.LEFT)
        self.stars_entry = tk.Entry(stars_frame, bg=input_bg, fg=fg_color, 
                                    font=('Arial', 11), width=20, insertbackground=fg_color)
        self.stars_entry.pack(side=tk.LEFT, padx=10)
        self.stars_entry.insert(0, "100")
        
        # Generate button
        generate_btn = tk.Button(main_frame, text="🎁 Kod Yarat", 
                                command=self.generate_code,
                                bg=button_bg, fg=fg_color, font=('Arial', 12, 'bold'),
                                padx=20, pady=10, cursor='hand2', relief=tk.FLAT)
        generate_btn.pack(pady=20)
        
        # Code display frame
        code_frame = tk.Frame(main_frame, bg=bg_color)
        code_frame.pack(fill=tk.X, pady=10)
        
        tk.Label(code_frame, text="Yaradılan kod:", bg=bg_color, fg=fg_color, 
                font=('Arial', 10)).pack(anchor='w', pady=(0, 5))
        
        code_display_frame = tk.Frame(code_frame, bg=input_bg, relief=tk.SUNKEN, borderwidth=2)
        code_display_frame.pack(fill=tk.X, pady=5)
        
        self.code_text = tk.Text(code_display_frame, height=3, bg=input_bg, fg="#00d4ff",
                                 font=('Courier', 10), wrap=tk.WORD, relief=tk.FLAT,
                                 insertbackground=fg_color, padx=5, pady=5)
        self.code_text.pack(fill=tk.BOTH, expand=True)
        
        # Copy button
        copy_btn = tk.Button(code_frame, text="📋 Kodu Kopyalə", 
                           command=self.copy_code,
                           bg="#4CAF50", fg=fg_color, font=('Arial', 10, 'bold'),
                           padx=15, pady=5, cursor='hand2', relief=tk.FLAT)
        copy_btn.pack(pady=5)
        
        # Info label
        info_label = tk.Label(main_frame, 
                             text="💡 İpucu: Kodlar base64 ilə kodlanır və bir dəfə istifadə edilə bilər.",
                             bg=bg_color, fg="#a0a0a0", font=('Arial', 9),
                             wraplength=450, justify=tk.LEFT)
        info_label.pack(pady=(10, 0))
        
    def generate_code(self):
        try:
            # Get values
            money = int(self.money_entry.get() or 0)
            diamonds = int(self.diamonds_entry.get() or 0)
            stars = int(self.stars_entry.get() or 0)
            
            # Validate
            if money < 0 or diamonds < 0 or stars < 0:
                messagebox.showerror("Xəta", "Mənfi dəyərlər daxil edilə bilməz!")
                return
            
            if money == 0 and diamonds == 0 and stars == 0:
                messagebox.showwarning("Xəbərdarlıq", "Ən azı bir hədiyyə miqdarı daxil edin!")
                return
            
            # Create data structure
            data = {
                "money": money,
                "diamonds": diamonds,
                "stars": stars
            }
            
            # Encode to JSON then base64 (without spaces for smaller code)
            json_str = json.dumps(data, separators=(',', ':'))
            encoded = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
            
            # Display code
            self.code_text.delete(1.0, tk.END)
            self.code_text.insert(1.0, encoded)
            
            # Print to console for verification
            print("\n" + "="*60)
            print("🎁 HƏDİYYƏ KODU YARADILDI")
            print("="*60)
            print(f"💰 Pul: {money}")
            print(f"💎 Elmas: {diamonds}")
            print(f"⭐ Ulduz: {stars}")
            print("-"*60)
            print(f"📝 JSON: {json_str}")
            print("-"*60)
            print(f"🔑 Kod (Base64):")
            print(f"   {encoded}")
            print("-"*60)
            print(f"📏 Kod uzunluğu: {len(encoded)} simvol")
            print("-"*60)
            
            # Verify code by decoding it
            try:
                decoded_json = base64.b64decode(encoded).decode('utf-8')
                decoded_data = json.loads(decoded_json)
                print("✅ KOD YOXLANILDI - Uyğundur!")
                print(f"   Dekodlaşdırılan məlumat: {decoded_data}")
                if decoded_data == data:
                    print("   ✅ Yaradılan və dekodlaşdırılan kodlar eynidir!")
                else:
                    print("   ⚠️ XƏTA: Məlumatlar uyğun gəlmir!")
            except Exception as verify_error:
                print(f"   ❌ KOD YOXLANILMASI UĞURSUZ: {verify_error}")
            
            print("="*60 + "\n")
            
            # Auto copy to clipboard
            try:
                pyperclip.copy(encoded)
                messagebox.showinfo("Uğur", f"Kod yaradıldı və clipboard-a kopyalandı!\n\n"
                                          f"💰 Pul: {money}\n"
                                          f"💎 Elmas: {diamonds}\n"
                                          f"⭐ Ulduz: {stars}\n\n"
                                          f"Kod konsolda göstərildi və yoxlanıldı!")
            except:
                messagebox.showinfo("Uğur", f"Kod yaradıldı!\n\n"
                                          f"💰 Pul: {money}\n"
                                          f"💎 Elmas: {diamonds}\n"
                                          f"⭐ Ulduz: {stars}\n\n"
                                          f"Kod konsolda göstərildi və yoxlanıldı!")
                
        except ValueError:
            messagebox.showerror("Xəta", "Yalnız rəqəm daxil edin!")
        except Exception as e:
            messagebox.showerror("Xəta", f"Xəta baş verdi: {str(e)}")
            print(f"\n❌ XƏTA: {str(e)}\n")
    
    def copy_code(self):
        code = self.code_text.get(1.0, tk.END).strip()
        if not code:
            messagebox.showwarning("Xəbərdarlıq", "Əvvəlcə kod yaradın!")
            return
        
        try:
            pyperclip.copy(code)
            
            # Verify the code that will be copied
            print("\n" + "="*60)
            print("📋 KOD KOPYALANIR")
            print("="*60)
            print(f"Kod: {code}")
            print(f"Uzunluq: {len(code)} simvol")
            
            # Try to decode and verify
            try:
                decoded_json = base64.b64decode(code).decode('utf-8')
                decoded_data = json.loads(decoded_json)
                print("✅ Kod uyğundur və dekodlaşdırıla bilir!")
                print(f"   Məlumat: {decoded_data}")
            except Exception as e:
                print(f"⚠️ XƏBƏRDARLIQ: Kod dekodlaşdırıla bilməz: {e}")
            
            print("="*60 + "\n")
            
            messagebox.showinfo("Uğur", "Kod clipboard-a kopyalandı və konsolda yoxlanıldı!")
        except:
            messagebox.showerror("Xəta", "Clipboard-a kopyalama mümkün olmadı!")


def main():
    root = tk.Tk()
    app = GiftCodeGenerator(root)
    root.mainloop()


if __name__ == "__main__":
    main()

